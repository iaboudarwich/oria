import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordSystemEvent } from "@/lib/data/system-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/voice/tts-unavailable
 *
 * The client calls this only when BOTH speech paths failed (no cloud tts-1 AND
 * no usable browser SpeechSynthesis), so the answer degraded to text-only. We
 * record one system_events row (kind='voice.tts_unavailable') so a silent voice
 * surface is never invisible. No audio or content is logged.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let reason = "unknown";
  try {
    const body = (await request.json()) as { reason?: unknown };
    if (typeof body.reason === "string") reason = body.reason.slice(0, 40);
  } catch {
    // keep default reason
  }

  await recordSystemEvent({
    kind: "voice.tts_unavailable",
    severity: "warn",
    message: "Voice answer degraded to text-only (no cloud or browser speech).",
    context: { reason },
    actorId: user.id,
  });
  return NextResponse.json({ ok: true });
}
