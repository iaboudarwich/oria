import "server-only";

import { getAnthropic, getModel } from "./anthropic";
import type { RetrievedSource } from "./retrieve";
import type { SectionScope } from "@/lib/data/section-scope";

export type AgentMessage = { role: "user" | "assistant"; content: string };

const BASE_RULES = `Rules:
- Answer only from the sources. If no source covers the question, say honestly that you don't see it yet and suggest what the user might upload or add.
- Cite every concrete fact inline with the source's bracket id, like "the bill was $184 [2]." Never invent a citation.
- If the only relevant sources are PENDING, do NOT say "I don't see anything." Say something like: "I found a relevant file [1] but I haven't finished reading it yet, give it a moment and ask again." You may still cite the pending source so the user can open it.
- Be concise. Two to four short sentences is usually right. Use a small bullet list only when the question genuinely asks for several items.
- Use the user's own language: dates as written, casual tone, no jargon. Never explain that you "searched the database" or describe your retrieval process.
- Respect privacy. Treat each source as something the user trusted you with.
- If sources point to multiple plausible answers, surface the most likely one and mention the others briefly.`;

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
