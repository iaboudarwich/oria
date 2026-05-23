import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentContext } from "@/lib/data/organizations";
import { isAnthropicConfigured } from "@/lib/ai/anthropic";
import { retrieveForQuery } from "@/lib/ai/retrieve";
import { streamAnswer, type AgentMessage } from "@/lib/ai/agent";
import { recordLearningEvent } from "@/lib/data/learning";
import { recordSystemEvent } from "@/lib/data/system-events";
import { checkDailyAskRequests } from "@/lib/data/quotas";
import { rateLimit, RATE_PRESETS } from "@/lib/rate-limit";
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // 1. Retrieval (works without an API key — useful for the empty case).
        const sources = await retrieveForQuery(query, { scope, crossSpace });
        writeEvent(controller, { type: "sources", sources });

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
        for await (const text of streamAnswer({
          query,
          history,
          sources,
          scope,
          timezone: tz,
          nowISO: new Date().toISOString(),
        })) {
          writeEvent(controller, { type: "delta", text });
        }

        writeEvent(controller, { type: "done" });
        controller.close();

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
