import "server-only";

import { getAnthropic, getModel } from "@/lib/ai/anthropic";

export type TranscribeResult = {
  text: string;
  detected_language: string;
  was_translated: boolean;
};

/**
 * Transcribe an audio blob using OpenAI Whisper, then optionally
 * translate the result to the target language via Haiku.
 *
 * Falls back to an error string if OPENAI_API_KEY is not set.
 */
export async function transcribeAudio(params: {
  audioBlob: Blob;
  targetLanguage?: "en" | "ar" | "fr" | "es";
}): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      text: "",
      detected_language: "en",
      was_translated: false,
    };
  }

  // ── Step 1: Whisper transcription ─────────────────────────────────────
  const formData = new FormData();
  formData.append("file", params.audioBlob, "audio.webm");
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!whisperRes.ok) {
    const err = await whisperRes.text();
    throw new Error(`Whisper error: ${err}`);
  }

  const whisperJson = (await whisperRes.json()) as {
    text: string;
    language?: string;
  };

  const transcribedText = whisperJson.text?.trim() ?? "";
  const detectedLanguage = whisperJson.language ?? "en";

  if (
    !params.targetLanguage ||
    detectedLanguage.startsWith(params.targetLanguage) ||
    params.targetLanguage === detectedLanguage
  ) {
    return {
      text: transcribedText,
      detected_language: detectedLanguage,
      was_translated: false,
    };
  }

  // ── Step 2: Optional translation via Haiku ────────────────────────────
  const anthropic = getAnthropic();
  if (!anthropic || !transcribedText) {
    return {
      text: transcribedText,
      detected_language: detectedLanguage,
      was_translated: false,
    };
  }

  const langNames: Record<string, string> = {
    en: "English",
    ar: "Arabic",
    fr: "French",
    es: "Spanish",
  };
  const targetName = langNames[params.targetLanguage] ?? params.targetLanguage;

  try {
    const msg = await anthropic.messages.create({
      model: getModel(),
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Translate the following text to ${targetName}. Return ONLY the translated text, nothing else.\n\n${transcribedText}`,
        },
      ],
    });
    const translated =
      msg.content[0]?.type === "text" ? msg.content[0].text.trim() : transcribedText;
    return {
      text: translated,
      detected_language: detectedLanguage,
      was_translated: true,
    };
  } catch {
    return {
      text: transcribedText,
      detected_language: detectedLanguage,
      was_translated: false,
    };
  }
}
