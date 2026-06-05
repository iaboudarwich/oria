import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, RATE_PRESETS } from "@/lib/rate-limit";
import { synthesizeSpeech } from "@/lib/voice/tts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/voice/tts  { text }  -> audio/mpeg, or { unavailable: true }.
 *
 * Cloud TTS (OpenAI tts-1) on the same key Whisper uses. When no key is set or
 * the call fails, it returns { unavailable: true } so the client falls back to
 * the browser SpeechSynthesis API. Never surfaces a provider error.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const burst = rateLimit({ key: `voice-tts:${user.id}`, ...RATE_PRESETS.ask() });
  if (!burst.ok) return NextResponse.json({ unavailable: true }, { status: 200 });

  let body: { text?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });

  const audio = await synthesizeSpeech(text);
  if (!audio) {
    // No cloud key or the call failed: tell the client to use browser speech.
    return NextResponse.json({ unavailable: true }, { status: 200 });
  }
  return new Response(audio, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
