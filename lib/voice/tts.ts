import "server-only";

/**
 * Cloud text-to-speech for spoken answers (Round 19.5). Uses OpenAI tts-1 via
 * the SAME OPENAI_API_KEY that already powers Whisper dictation, so there is no
 * new provider, account, or env. Returns mp3 bytes, or null when unavailable
 * (no key, or an API error) so the caller can fall back to browser speech.
 * Never throws and never logs the text or key.
 */
export function isCloudTtsConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export async function synthesizeSpeech(text: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  const input = text.trim().slice(0, 800);
  if (!apiKey || !input) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "alloy",
        input,
        response_format: "mp3",
      }),
    });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}
