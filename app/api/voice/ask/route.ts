import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import { getCurrentContext } from "@/lib/data/organizations";
import { isAnthropicConfigured } from "@/lib/ai/anthropic";
import { retrieveForQuery } from "@/lib/ai/retrieve";
import { streamAnswer } from "@/lib/ai/agent";
import { rateLimit, RATE_PRESETS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/voice/ask  { transcript }
 *
 * The spoken-answer endpoint. It reuses the SAME data path as Ask Oria
 * (retrieveForQuery over the user's live schedule, bills, reminders, items,
 * health) and the SAME provider seam (streamAnswer), with voice mode on so the
 * reply is one or two short spoken-style sentences. v1 ANSWERS only; if the
 * user asks Oria to act, the voice prompt makes it say that is coming soon
 * rather than perform the action. Returns the full answer text (the client
 * speaks it and shows it).
 */
export async function POST(request: Request) {
  const ctx = await getCurrentContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const burst = rateLimit({ key: `voice-ask:${ctx.profile.id}`, ...RATE_PRESETS.ask() });
  if (!burst.ok) {
    return NextResponse.json({ error: "rate_limited", message: burst.message }, { status: 429 });
  }

  let body: { transcript?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
  if (!transcript) return NextResponse.json({ error: "empty" }, { status: 400 });

  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: "no_key" }, { status: 503 });
  }

  try {
    const tz = (await cookies()).get("oria_tz")?.value ?? null;
    const sources = await retrieveForQuery(transcript, {});
    let answer = "";
    for await (const delta of streamAnswer({
      userId: ctx.profile.id,
      query: transcript,
      sources,
      voice: true,
      timezone: tz,
      nowISO: new Date().toISOString(),
      telemetry: { organizationId: ctx.organization.id, actorId: ctx.profile.id },
    })) {
      answer += delta;
    }
    return NextResponse.json({ answer: answer.trim() });
  } catch (e) {
    Sentry.captureException(e, { tags: { surface: "voice" } });
    return NextResponse.json({ error: "stream_failed" }, { status: 500 });
  }
}
