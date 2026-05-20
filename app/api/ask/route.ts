import { NextResponse } from "next/server";
import { getCurrentContext } from "@/lib/data/organizations";
import { isAnthropicConfigured } from "@/lib/ai/anthropic";
import { retrieveForQuery } from "@/lib/ai/retrieve";
import { streamAnswer, type AgentMessage } from "@/lib/ai/agent";
import { recordLearningEvent } from "@/lib/data/learning";

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

  let body: { query?: string; history?: AgentMessage[] } = {};
  try {
    body = (await request.json()) as { query?: string; history?: AgentMessage[] };
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "empty_query" }, { status: 400 });
  }
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

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
        // 1. Retrieval (works without an API key — useful for the empty case).
        const sources = await retrieveForQuery(query);
        writeEvent(controller, { type: "sources", sources });

        // 2. If Claude isn't configured, surface a calm error and stop.
        if (!isAnthropicConfigured()) {
          writeEvent(controller, { type: "error", code: "no_key" });
          controller.close();
          return;
        }

        // 3. Stream the answer.
        for await (const text of streamAnswer({
          query,
          history,
          sources,
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
            via: "ask",
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
