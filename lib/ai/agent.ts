import "server-only";

import { getAnthropic, getModel } from "./anthropic";
import type { RetrievedSource } from "./retrieve";
import type { SectionScope } from "@/lib/data/section-scope";

export type AgentMessage = { role: "user" | "assistant"; content: string };

const BASE_RULES = `Rules:
- Answer only from the sources. If no source covers the question, say honestly that you don't see it yet and suggest what the user might upload or add.
- STRUCTURED RECORDS FIRST, FILES SECOND. Many of your sources are structured rows the extractor already produced — they carry merchant, amount, date, calories, recurrence, direction. When both a structured row and a raw file match the question, ANSWER FROM THE STRUCTURED ROW and cite the file only if it adds detail. The structured row is the work the model already did; the file is the source it came from.
- Cite every concrete fact inline with the source's bracket id, like "the bill was $184 [2]." Never invent a citation.
- If the only relevant sources are PENDING, do NOT say "I don't see anything." Say "I found a relevant file [1] but I haven't finished reading it yet, give it a moment and ask again." You may still cite the pending source.
- Use the user's own language: dates as written, casual tone, no jargon. Never explain that you "searched the database" or describe your retrieval process.
- If sources point to multiple plausible answers, surface the most likely one and mention the others briefly.

BEHAVE LIKE AN ASSISTANT, NOT A DOCUMENT READER.

When the question is a single lookup ("show me the Hermès receipt", "when is my flight"), be specific and short — two to four sentences.

When the question is a ROLL-UP — "how much did I spend", "how many calories today", "show me my recent X", "what's coming up", "list my bills", "this week / this month", "compare", "average", "breakdown", "summary" — DO THE WORK:
- Sum the amounts (or calories, or counts) across the relevant sources.
- Lead with the headline number.
- Then a short breakdown — top contributors by merchant, by section, or by day. Use a bullet list when it makes the answer easier to scan.
- If amounts span multiple currencies, separate them — don't pretend they add.
- If the user said "today" / "this week" / "this month", scope the totals to that window using the source date metadata.
- End with one small offer of help ("Want a breakdown by category?" or "Should I add a reminder for the next one?") only if it's genuinely useful.

EXAMPLE format for "how much did I spend":
"You spent about $763 across 4 receipts.
- $419 at Hermès [2]
- $260 at Aïshti [1]
- $84 at Spinneys [3]
Want a category breakdown?"

Numbers are facts. Don't hedge them with "approximately" unless the sources truly conflict.`;

const GENERAL_SYSTEM_PROMPT = `You are Oria, a private AI assistant that helps people remember and act on what's in their own files, reminders, and calendar.

You work strictly from the SOURCES section the system provides. Each source has a numeric id in square brackets, e.g. [1], [2]. Each source is also marked as either READY (full content available) or PENDING (file exists but hasn't been read yet).

${BASE_RULES}`;

function sectionSystemPrompt(scope: SectionScope): string {
  return `You are Oria, scoped to the "${scope.label}" section.

You ONLY answer from sources inside this section. Do not draw on data from other sections, other circles, or other work spaces — even if you remember it from earlier in this conversation. If the user asks about something outside ${scope.label}, say so honestly and suggest they ask the general Ask Oria.

SOURCES are everything in this section: uploads, extracted items, and Oria's saved memories for this section (kind="memory"). Memories are short facts the user has explicitly taught Oria for this section — treat them as authoritative context, and cite them like any other source.

${BASE_RULES}`;
}

/** Format a single source row for the prompt. */
function formatSource(s: RetrievedSource): string {
  const state = s.processing_state === "pending" ? "PENDING" : "READY";
  const kindLabel =
    s.kind === "upload" ? "Upload" : s.kind === "reminder" ? "Reminder" : "Memory";
  const head = `[${s.id}] (${state}) ${kindLabel}: "${s.title}" — ${s.meta.space_name}${s.meta.section_label ? ` · ${s.meta.section_label}` : ""}${s.meta.date_label ? ` · ${s.meta.date_label}` : ""}`;
  return `${head}\n${s.snippet}`;
}

/**
 * Run a streaming Claude call over the retrieved context. Yields plain text
 * deltas as Claude produces them.
 *
 * Throws if Anthropic isn't configured — caller should branch on
 * isAnthropicConfigured() first to render a friendlier UX.
 */
export async function* streamAnswer(input: {
  query: string;
  history?: AgentMessage[];
  sources: RetrievedSource[];
  scope?: SectionScope | null;
}): AsyncGenerator<string, void, unknown> {
  const client = getAnthropic();
  if (!client) throw new Error("anthropic_not_configured");

  const sourceBlock =
    input.sources.length === 0
      ? "(no sources matched the question)"
      : input.sources.map(formatSource).join("\n\n");

  const userMessage = `SOURCES\n${sourceBlock}\n\nQUESTION\n${input.query}`;

  const messages = [
    ...(input.history ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user" as const, content: userMessage },
  ];

  const system = input.scope
    ? sectionSystemPrompt(input.scope)
    : GENERAL_SYSTEM_PROMPT;

  const stream = await client.messages.stream({
    model: getModel(),
    max_tokens: 800,
    system,
    messages,
  });

  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "text_delta"
    ) {
      yield chunk.delta.text;
    }
  }
}
