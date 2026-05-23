import "server-only";

import { getAnthropic, getModel } from "./anthropic";
import type { RetrievedSource } from "./retrieve";
import type { SectionScope } from "@/lib/data/section-scope";

export type AgentMessage = { role: "user" | "assistant"; content: string };

const BASE_RULES = `Rules:
- ANSWER FROM STRUCTURED RECORDS FIRST. Sources tagged "Memory" / item records carry the fields the extractor already produced — merchant, amount, date, calories, macros, direction. When such a record matches the question, treat it as authoritative. Files are background; don't make the user re-read them. NEVER say "I don't see a food diary" or "no expenses logged" when matching item records are present in the sources — that's the answer.
- Keep answers short and direct. One sentence is often enough.
- Do NOT default to dash/bullet lists. Use prose. Bullets only when the user explicitly asked for a list, or when 4+ items genuinely need to scan side-by-side.
- Cite a source bracket id only when the user asked for sources, files, proof, or origin, or when there's ambiguity. Most answers should read as natural sentences without [1] [2] noise.
- If no source covers the question, say so plainly and tell the user what to add. Don't pretend.
- If the only relevant sources are PENDING, say "I see a relevant file but I'm still reading it." You may include one citation.
- Use the user's own language: their dates, their tone. Never explain your retrieval process.
- Numbers are facts. Don't hedge with "approximately" unless sources truly conflict.

BEHAVE LIKE AN ASSISTANT, NOT A DOCUMENT READER.

When the question is a single lookup ("when is my flight", "what did I eat for lunch"), reply in 1–2 sentences. Headline figure first if there is one.

When the question is a ROLL-UP — "how much did I spend", "how many calories today/yesterday/this week", "what's coming up", "summary" — DO THE WORK:
- Sum the amounts (or calories, or counts) across the relevant records.
- Lead with the headline number, in one sentence.
- Only add a short breakdown if the user asked for one or if there are 4+ contributors worth naming.
- If amounts span multiple currencies, separate them — don't pretend they add.
- Respect the time window the user named ("today", "yesterday", "this week", "last 7 days") using the record date metadata. Records carry occurred_at in UTC; compare against today/yesterday in the user's timezone (assume the user means their own calendar day).

When the question is "WHAT'S COMING UP" / "what's next" / "this week":
- Combine reminders, calendar items, flights, lease/contract expirations, and recurring bill due dates from the sources.
- Order by date, soonest first.
- Lead with a one-line summary ("3 things this week"), then a short list with the date inline.

When the question is "WHAT SHOULD I REVIEW" / "anything I missed" / "what needs attention":
- Surface uploads still in Unsorted, files that didn't extract cleanly (low confidence or marked unclear), and any recurring item that's overdue.
- Lead with a one-line count, then list each with what's wrong ("In Unsorted — looks like a receipt", "Lease expires in 6 days").
- Be direct. The user wants a to-do list, not a tour.

Skip the follow-up offer unless it would clearly save the user time.

EXAMPLE for a meal lookup ("what did I eat today"):
"You logged a tuna sandwich with side salad for lunch — about 520 calories."

EXAMPLE for a roll-up ("how much did I spend"):
"You spent $763 across 4 receipts. The biggest was Hermès at $419."`;

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
  /** IANA timezone for resolving "today"/"yesterday". Defaults to UTC. */
  timezone?: string | null;
  /** Optional user-supplied "now" ISO instant. Defaults to server now. */
  nowISO?: string | null;
}): AsyncGenerator<string, void, unknown> {
  const client = getAnthropic();
  if (!client) throw new Error("anthropic_not_configured");

  const sourceBlock =
    input.sources.length === 0
      ? "(no sources matched the question)"
      : input.sources.map(formatSource).join("\n\n");

  // Today/yesterday/this-week answers depend on the model knowing what
  // today actually is in the user's TZ. Without this, "what did I eat
  // today" answers correctly retrieved a meal dated 2026-05-22 but the
  // agent didn't realize that 2026-05-22 was today and said "nothing
  // from today's date."
  const tz = input.timezone || "UTC";
  const nowDate = input.nowISO ? new Date(input.nowISO) : new Date();
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(nowDate);
  const isoLocalDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(nowDate);
  const dateHeader = `TODAY: ${dateLabel} (${isoLocalDay}, timezone ${tz}). Treat any record dated ${isoLocalDay} as TODAY. "Yesterday" = the day before. Compare record occurred_at dates against this when the user says today/yesterday/this week.`;

  const userMessage = `${dateHeader}\n\nSOURCES\n${sourceBlock}\n\nQUESTION\n${input.query}`;

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
