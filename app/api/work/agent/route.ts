import { NextResponse } from "next/server";
import { getCurrentContext } from "@/lib/data/organizations";
import { isAnthropicConfigured } from "@/lib/ai/anthropic";
import { retrieveForQuery } from "@/lib/ai/retrieve";
import { streamWorkAgent, type AgentMessage } from "@/lib/ai/work-agent";
import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { recordLearningEvent } from "@/lib/data/learning";
import { checkDailyAskRequests } from "@/lib/data/quotas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Work AI Agent streaming endpoint. Same NDJSON protocol as /api/ask,
 * but the agent is bound to the active Workspace, includes the
 * Workspace's standing context, and uses a longer response budget.
 *
 * Office orgs only. Personal/circle contexts get a 400.
 */
export async function POST(request: Request) {
  const ctx = await getCurrentContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (ctx.organization.kind !== "office") {
    return NextResponse.json({ error: "not_a_workspace" }, { status: 400 });
  }

  let body: { query?: string; history?: AgentMessage[] } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "empty_query" }, { status: 400 });
  }
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

  const quota = await checkDailyAskRequests(ctx.profile.id);
  if (!quota.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: quota.message },
      { status: 429 },
    );
  }

  const workspaceContext = await getWorkspaceContext();
  const encoder = new TextEncoder();

  function writeEvent(
    controller: ReadableStreamDefaultController<Uint8Array>,
    obj: unknown,
  ) {
    controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Retrieval runs against the active org (the Workspace) by default.
        // Pull a slightly wider set than Ask Oria — operational questions
        // often need to compare across documents.
        const sources = await retrieveForQuery(query, { scope: null });
        writeEvent(controller, { type: "sources", sources });

        if (!isAnthropicConfigured()) {
          writeEvent(controller, { type: "error", code: "no_key" });
          controller.close();
          return;
        }

        for await (const text of streamWorkAgent({
          query,
          history,
          sources,
          workspaceName: ctx.organization.name,
          workspaceContext,
        })) {
          writeEvent(controller, { type: "delta", text });
        }

        writeEvent(controller, { type: "done" });
        controller.close();

        void recordLearningEvent({
          organizationId: ctx.organization.id,
          actorId: ctx.profile.id,
          kind: "search.queried",
          payload: {
            q: query.slice(0, 200),
            via: "work-agent",
            hits: { sources: sources.length },
          },
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "unknown";
        writeEvent(controller, { type: "error", code: "stream_failed", message });
        controller.close();
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
