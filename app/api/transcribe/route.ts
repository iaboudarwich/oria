import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { transcribeAudio } from "@/lib/ai/transcribe";
import type { Locale } from "@/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Rate limit: 30 transcriptions per minute per user
  const rl = rateLimit({
    key: `transcribe:${user.id}`,
    limit: 30,
    windowMs: 60_000,
    label: "voice transcription",
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: rl.message },
      { status: 429 },
    );
  }

  try {
    const form = await request.formData();
    const audioFile = form.get("audio");
    const targetLanguage = (form.get("target_language") as Locale | null) ?? undefined;

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json({ error: "missing_audio" }, { status: 400 });
    }

    const result = await transcribeAudio({
      audioBlob: audioFile,
      targetLanguage,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "transcription_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
