import "server-only";

import { getProvider } from "@/lib/ai-providers";
import type { ProposedAction } from "@/lib/actions/write-actions";

/**
 * Detect a voice COMMAND to set a reminder and extract it, so voice can ACT
 * (Round 21) but only behind the confirm + undo rails. v1 voice acts on
 * reminders (Oria-owned, reversible); other "do something" requests are not
 * acted on by voice yet and fall through to a normal spoken answer.
 *
 * Infrastructure AI (Oria's key). Never throws. Resolves relative dates against
 * the user's local "today". A request with no explicit TIME comes back with
 * time=null, so the caller asks rather than inventing one (never guess-and-act).
 */
export async function classifyVoiceReminder(
  userId: string,
  transcript: string,
  localDate: string,
  tz: string,
): Promise<ProposedAction | null> {
  const system = `You decide whether a spoken request is an explicit COMMAND to set a reminder, and if so extract it. Today is ${localDate} in timezone ${tz}.
Return JSON only:
{"is_reminder": true|false, "title": "<short thing to be reminded of>", "date": "YYYY-MM-DD"|null, "time": "HH:MM 24-hour"|null}
Rules:
- is_reminder is true ONLY for an explicit ask like "remind me", "set a reminder", "don't let me forget". A question ("what's on my schedule") is NOT a reminder.
- Resolve relative dates ("tomorrow", "tonight", "next Friday") to an absolute YYYY-MM-DD.
- If a clock time is spoken give HH:MM (2pm -> 14:00, "this evening" -> 18:00). If NO time is given, return null for time. NEVER invent a time.
- Keep the title short and human, without the date/time words.
- JSON only, no commentary, no em-dashes.`;

  try {
    const adapter = await getProvider(userId, "infrastructure");
    if (!adapter) return null;
    const res = await adapter.complete(
      [
        { role: "system", content: system },
        { role: "user", content: transcript.slice(0, 600) },
      ],
      { tier: "fast", maxTokens: 160, jsonMode: true },
    );
    const raw = res.content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const parsed = JSON.parse(raw) as {
      is_reminder?: unknown;
      title?: unknown;
      date?: unknown;
      time?: unknown;
    };
    if (parsed.is_reminder !== true) return null;
    const title = typeof parsed.title === "string" ? parsed.title.trim().slice(0, 200) : "";
    const date =
      typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
        ? parsed.date
        : null;
    const time =
      typeof parsed.time === "string" && /^\d{2}:\d{2}$/.test(parsed.time) ? parsed.time : null;
    return { type: "reminder.create", title, date, time };
  } catch {
    return null;
  }
}
