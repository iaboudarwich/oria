import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import { getCurrentContext } from "@/lib/data/organizations";
import { isAnthropicConfigured } from "@/lib/ai/anthropic";
import { retrieveForQuery } from "@/lib/ai/retrieve";
import { streamAnswer, type AgentMessage } from "@/lib/ai/agent";
import { classifyReasoningIntent } from "@/lib/ai/reasoning-classifier";
import { recordLearningEvent } from "@/lib/data/learning";
import { recordSystemEvent } from "@/lib/data/system-events";
import { checkDailyAskRequests } from "@/lib/data/quotas";
import { rateLimit, RATE_PRESETS } from "@/lib/rate-limit";
import {
  createConversation,
  addMessage,
} from "@/lib/data/conversations";
import { createClient } from "@/lib/supabase/server";
import { trackEvent } from "@/lib/analytics";
import { modeForOrgKind } from "@/lib/data/mode";
import { recordBehaviorSignal } from "@/lib/data/behavior-signals";
import { getUserProfile } from "@/lib/data/user-profile";
import {
  buildPersonalizationContext,
  personalContextBlock,
} from "@/lib/ai/personalization";
import { sectionLabel } from "@/lib/sections-meta";
import type { SpaceContext } from "@/lib/ai/agent";
import type { SectionScope } from "@/lib/data/section-scope";
import type { Section } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Ask Oria endpoint.
 *
 * Request body:
 *   {
 *     query: string,            // the user's question
 *     history?: AgentMessage[]  // prior turns of the conversation (optional)
 *   }
 *
 * Response: NDJSON stream. Each line is one of:
 *   { "type": "sources", "sources": [...] }   // sent first, always
 *   { "type": "delta",   "text": "..." }     // many of these as Claude streams
 *   { "type": "done" }                        // sent at the end
 *   { "type": "error",   "code": "no_key" }   // sent + closed on failure
 */
export async function POST(request: Request) {
  const ctx = await getCurrentContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    query?: string;
    history?: AgentMessage[];
    scope?: { kind?: string; key?: string; label?: string } | null;
    crossSpace?: boolean;
    /** Pass an existing id to continue a conversation, omit to start a new one. */
    conversationId?: string | null;
    /** Client requests the reasoning tier (Think harder / offer re-run). */
    reasoning?: boolean;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "empty_query" }, { status: 400 });
  }
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

  // Burst limit: stop someone holding Enter or a script firing dozens
  // of questions per second. Cheaper to bounce here than to spin up
  // retrieval + Claude.
  const burst = rateLimit({
    key: `ask:${ctx.profile.id}`,
    ...RATE_PRESETS.ask(),
  });
  if (!burst.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: burst.message },
      {
        status: 429,
        headers: { "Retry-After": String(burst.retryAfterSeconds) },
      },
    );
  }

  // Beta safety net: per-user daily Ask Oria cap. Soft-fails open on DB error.
  const quota = await checkDailyAskRequests(ctx.profile.id);
  if (!quota.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: quota.message },
      { status: 429 },
    );
  }

  // Optional section scope. When set, retrieval is restricted to this
  // section (uploads + items + memories) and the agent is told to refuse
  // to answer cross-section questions.
  const scope: SectionScope | null = (() => {
    const s = body.scope;
    if (!s || typeof s.kind !== "string" || typeof s.key !== "string") return null;
    const label = typeof s.label === "string" && s.label ? s.label : s.key;
    if (s.kind === "builtin") return { kind: "builtin", key: s.key as Section, label };
    if (s.kind === "custom") return { kind: "custom", key: s.key, label };
    if (s.kind === "smart" && (s.key === "diet" || s.key === "bills")) {
      return { kind: "smart", key: s.key, label };
    }
    return null;
  })();

  const encoder = new TextEncoder();

  function writeEvent(
    controller: ReadableStreamDefaultController<Uint8Array>,
    obj: unknown,
  ) {
    controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
  }

  // God's Eye view: client requests crossSpace when the user has flipped
  // the "Everywhere I own" toggle. We only honour it when there's no
  // section scope (a scoped Ask is, by definition, single-section) and
  // when the user is currently in their Personal space (retrieveForQuery
  // re-checks this on the server too, so a forged request can't broaden).
  const crossSpace = body.crossSpace === true && !scope;

  // Reasoning decision. reasoning_mode: auto (classify + offer), manual (button
  // only), always (every query reasons), never (disabled). The base answer
  // stays on the fast tier (today's behavior); reasoning is the deeper upgrade.
  let reasoningMode: "auto" | "manual" | "always" | "never" = "auto";
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("reasoning_mode")
      .eq("id", ctx.profile.id)
      .maybeSingle();
    const m = (data as { reasoning_mode?: string } | null)?.reasoning_mode;
    if (m === "manual" || m === "always" || m === "never") reasoningMode = m;
  } catch {
    // default to auto
  }
  const wantsReasoning = body.reasoning === true && reasoningMode !== "never";
  const useReasoning = reasoningMode === "always" || wantsReasoning;
  const runClassifier = reasoningMode === "auto" && !useReasoning;
  const reasoningTrigger =
    reasoningMode === "always" ? "always_mode" : wantsReasoning ? "user_button" : "not_used";

  // Resolve (or create) a conversation for persistence. Best-effort:
  // if the DB call fails we still serve the answer. conversationId
  // stays null and nothing is persisted this turn.
  let conversationId: string | null =
    typeof body.conversationId === "string" ? body.conversationId : null;
  if (!conversationId) {
    conversationId = await createConversation({
      userId: ctx.profile.id,
      organizationId: ctx.organization.id,
      firstMessage: query,
    });
  }
  // Persist the user's message before streaming starts.
  if (conversationId) {
    void addMessage({ conversationId, role: "user", content: query });
  }

  // Space + user context for tailoring the answer. One lightweight query
  // covers both the recent-upload titles and the most-used-section tally.
  let spaceContext: SpaceContext | null = null;
  try {
    const supabase = await createClient();
    const { data: recentRows } = await supabase
      .from("uploads")
      .select("title, filename, section")
      .eq("organization_id", ctx.organization.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(60);
    const rows = (recentRows ?? []) as Array<{
      title: string | null;
      filename: string;
      section: Section | null;
    }>;
    const recentUploads = rows
      .slice(0, 3)
      .map((r) => r.title || r.filename)
      .filter(Boolean);
    const tally = new Map<Section, number>();
    for (const r of rows) {
      if (r.section) tally.set(r.section, (tally.get(r.section) ?? 0) + 1);
    }
    const topSections = [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([s]) => sectionLabel(s));
    const lang = (await cookies()).get("oria_locale")?.value ?? "en";
    spaceContext = {
      spaceType:
        modeForOrgKind(ctx.organization.kind) === "work" ? "Work" : "Personal",
      template: ctx.organization.template_key ?? null,
      topSections,
      recentUploads,
      language: lang,
    };
  } catch {
    spaceContext = null;
  }

  // Behavior signal: a question was asked. Fire-and-forget, never awaited.
  void recordBehaviorSignal({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    type: "query_asked",
    value: { length: query.length, section: scope?.key ?? null },
  });

  // Personalization: target length, tone, focus areas, pinned metrics.
  let personalContext: string | null = null;
  try {
    const profile = await getUserProfile(ctx.profile.id);
    personalContext = personalContextBlock(buildPersonalizationContext(profile));
  } catch {
    personalContext = null;
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // 1. Retrieval (works without an API key. useful for the empty case).
        //    The reasoning classifier runs in parallel so it never blocks.
        const [sources, intent] = await Promise.all([
          retrieveForQuery(query, { scope, crossSpace }),
          runClassifier
            ? classifyReasoningIntent(ctx.profile.id, query)
            : Promise.resolve({ analytical: false, confidence: 0 }),
        ]);
        writeEvent(controller, { type: "sources", sources });

        // Offer deeper thinking when the question reads as analytical (auto mode).
        if (runClassifier && intent.analytical && intent.confidence > 0.7) {
          writeEvent(controller, { type: "reasoning_offer" });
        }

        // 2. If Claude isn't configured, surface a calm error and stop.
        if (!isAnthropicConfigured()) {
          writeEvent(controller, { type: "error", code: "no_key" });
          controller.close();
          return;
        }

        // 3. Stream the answer. Pass the user's TZ so the agent can
        //    resolve today/yesterday correctly when reasoning over
        //    record occurred_at dates.
        const tz = (await cookies()).get("oria_tz")?.value ?? null;
        let fullAnswer = "";
        let thinking = "";
        for await (const text of streamAnswer({
          userId: ctx.profile.id,
          query,
          history,
          sources,
          scope,
          timezone: tz,
          nowISO: new Date().toISOString(),
          spaceContext,
          personalContext,
          tier: useReasoning ? "reasoning" : "fast",
          reasoningTrigger,
          onThinking: (t) => {
            thinking = t;
          },
          telemetry: {
            organizationId: ctx.organization.id,
            actorId: ctx.profile.id,
          },
        })) {
          fullAnswer += text;
          writeEvent(controller, { type: "delta", text });
        }

        // Surface the reasoning trace (Anthropic extended thinking) for the
        // optional "View reasoning" collapsible.
        if (useReasoning && thinking) {
          writeEvent(controller, { type: "reasoning", text: thinking });
        }

        // Include conversation_id in done frame so the client can
        // update its URL or state without an extra round-trip.
        writeEvent(controller, { type: "done", conversationId });
        controller.close();

        // Persist the assistant's full response.
        if (conversationId && fullAnswer) {
          void addMessage({
            conversationId,
            role: "assistant",
            content: fullAnswer,
          });
        }

        // Fire first_ask_oria_query on the user's very first Ask Oria query.
        // Only when this request opened a new conversation (client sent no
        // conversationId). Count is an index-only scan on conversations.user_id.
        if (!body.conversationId && fullAnswer) {
          void (async () => {
            const supabase = await createClient();
            const { count } = await supabase
              .from("conversations")
              .select("id", { count: "exact", head: true })
              .eq("user_id", ctx.profile.id);
            if ((count ?? 0) === 1) trackEvent("first_ask_oria_query");
          })();
        }

        // Fire-and-forget telemetry. Same shape as search.queried so the
        // training pipeline can treat both signals uniformly later.
        void recordLearningEvent({
          organizationId: ctx.organization.id,
          actorId: ctx.profile.id,
          kind: "search.queried",
          payload: {
            q: query.slice(0, 200),
            via: scope ? `ask:${scope.kind}:${scope.key}` : "ask",
            hits: { sources: sources.length },
          },
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "unknown";
        Sentry.captureException(e, {
          tags: { surface: "ask" },
          extra: { orgId: ctx.organization.id, actorId: ctx.profile.id },
        });
        writeEvent(controller, { type: "error", code: "stream_failed", message });
        controller.close();
        void recordSystemEvent({
          kind: "ai.error",
          severity: "error",
          message,
          context: {
            surface: scope ? `ask:${scope.kind}:${scope.key}` : "ask",
            query: query.slice(0, 200),
          },
          organizationId: ctx.organization.id,
          actorId: ctx.profile.id,
        });
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
