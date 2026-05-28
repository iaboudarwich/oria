import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "./anthropic";
import { recordAiCall, recordAiError } from "./telemetry";
import {
  EXTRACTION_TOOL,
  getTextExtractionModel,
  normalize,
  type ExtractionOutcome,
  type SmartSection,
} from "./extract";
import type { Section } from "@/lib/supabase/types";

/**
 * Extract structured items from plain typed text.
 *
 * Same item schema as file extraction (one tool, one shape), but the
 * input is a single text block plus contextual hints (active section,
 * user's local "now" + timezone for resolving relative dates like
 * "yesterday" / "next Friday").
 *
 * Returns the same ExtractionOutcome shape as extractFromUpload so
 * the downstream insert code path stays identical.
 */

const TEXT_SYSTEM_PROMPT = `You are Oria's quick-log engine. The user types a short note into a section of their personal/work workspace, and you turn it into one or more structured items the rest of the app can render, search, and ask questions about.

What good output looks like:
- One item per discrete thing the user mentioned. "Lunch was pasta and I paid the electric bill" → TWO items (a diet item and a bills item).
- Confidence reflects how cleanly you understood the note. If it's vague ("had something good for lunch"), confidence below 0.6 and leave amounts/dates null instead of guessing.

DATES — the input includes USER_NOW (ISO 8601 in UTC) and USER_TIMEZONE (IANA, e.g. "America/Los_Angeles"). Always resolve relative dates against USER_NOW in USER_TIMEZONE, then output occurred_at as an ISO 8601 UTC instant:
- "today" / "tonight" / "now" → USER_NOW
- "yesterday" → midnight of (USER_NOW - 1 day) at a reasonable hour (12:00 local) — UNLESS the user gave a specific time
- "tomorrow", "next Friday", "in 3 days" → resolve forward
- Specific dates without a year → the closest plausible occurrence (June 1 in May = this June 1; in July = next June 1)
- Explicit times ("at 8pm", "for 7:30") → use that local time
- If the note has no date cue at all and the item is a meal/expense the user just experienced, treat it as occurring at USER_NOW.

DIET items: estimate calories, protein_g, carbs_g, fat_g from the description. Be decisive — "1 cup pasta with parmesan" should produce a number, not null. The downstream pipeline forces occurred_at to USER_NOW for diet items, so you can leave that null.

EXPENSES/RECEIPTS: capture merchant, amount_value, amount_currency (default USD if user wrote "$" without a code), occurred_at, category ("groceries", "shopping", "dining out", etc), direction="outflow". document_type="receipt" when phrased as a purchase.

BILLS/INVOICES: smart_section="bills" when this is something the user owes or needs to pay (rent, utility, subscription, invoice). Set is_recurring + recurring_interval when stated ("rent every month" → monthly). occurred_at = the DUE DATE. amount + currency.

TRAVEL: document_type="ticket"/"boarding_pass"/"itinerary"/"schedule" as fits. ONE ITEM PER LEG / EVENT. occurred_at = the departure/event datetime. merchant = the carrier when given. Suggest section="travel".

CONTRACTS / LEASES: document_type="contract". occurred_at = expiration or next renewal date. summary = key terms (parties, renewal logic, monthly amount).

HEALTH / PERSONAL / HOUSEHOLD: capture the actionable bit. A doctor appointment is a "schedule" doc_type with occurred_at; a household task is a generic item with action_items.

SECTION CONTEXT: the input includes SECTION_HINT (one of the built-in section names, a custom section name, "diet", "bills", or empty). Default suggested_section / smart_section to the hint when the text is ambiguous. Override when the text clearly belongs elsewhere (user typing about a meal on the Bills page should still produce a Diet item).

If the text doesn't describe anything actionable (greetings, single words, gibberish), return an empty items array and call the tool with source_quality_notes="not actionable".

You MUST call the store_extraction tool. Don't reply with prose.`;

export type TextExtractInput = {
  /** What the user typed. Trim/sanitize before passing. */
  text: string;
  /** Built-in section the user is on, if any. */
  section?: Section | null;
  /** Smart section context, if any. */
  smartSection?: SmartSection | null;
  /** Custom section name (used as a soft hint to the model). */
  customSectionName?: string | null;
  /** IANA timezone identifier, e.g. "America/Los_Angeles". Defaults to "UTC". */
  timezone?: string;
  /** ISO 8601 instant representing the user's "now". Defaults to server now. */
  nowISO?: string;
};

export async function extractFromText(
  input: TextExtractInput,
): Promise<ExtractionOutcome> {
  const client = getAnthropic();
  if (!client) return { kind: "skipped", reason: "model_unavailable" };

  const tz = input.timezone || "UTC";
  const nowISO = input.nowISO || new Date().toISOString();

  const hintLines: string[] = [`USER_NOW: ${nowISO}`, `USER_TIMEZONE: ${tz}`];
  if (input.smartSection) {
    hintLines.push(`SECTION_HINT: smart_section=${input.smartSection}`);
  } else if (input.section) {
    hintLines.push(`SECTION_HINT: ${input.section}`);
  } else if (input.customSectionName) {
    hintLines.push(`SECTION_HINT: custom section "${input.customSectionName}"`);
  } else {
    hintLines.push(`SECTION_HINT: (none — pick from content)`);
  }

  const userMessage = `${hintLines.join("\n")}\n\nUSER TYPED:\n${input.text}`;

  // Typed logs are short + plain — run them on the cheap model (routing).
  const model = getTextExtractionModel();
  let response: Anthropic.Messages.Message;
  const startedAt = Date.now();
  try {
    response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: TEXT_SYSTEM_PROMPT,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "store_extraction" },
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (e) {
    recordAiError({
      surface: "text-extract",
      model,
      latencyMs: Date.now() - startedAt,
      error: e,
      extra: { textLen: input.text.length },
    });
    return { kind: "skipped", reason: "model_error" };
  }

  if (response.usage) {
    recordAiCall({
      surface: "text-extract",
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs: Date.now() - startedAt,
      extra: { textLen: input.text.length },
    });
  }

  const toolUse = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) return { kind: "skipped", reason: "empty_result" };

  const result = normalize(
    toolUse.input as Record<string, unknown>,
    response.model,
  );
  if (result.items.length === 0) {
    return { kind: "skipped", reason: "empty_result" };
  }
  return { kind: "ok", result };
}
