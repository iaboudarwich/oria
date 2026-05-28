import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, getModel } from "./anthropic";
import { recordAiCall, recordAiError } from "./telemetry";

type Section =
  | "household"
  | "travel"
  | "properties"
  | "staff"
  | "events"
  | "finance"
  | "legal"
  | "personal"
  | "vendors"
  | "health";

const BUILTIN_SECTIONS: Section[] = [
  "household",
  "travel",
  "properties",
  "staff",
  "events",
  "finance",
  "legal",
  "personal",
  "vendors",
  "health",
];

export type SortDecision = {
  item_id: string;
  target_kind: "builtin" | "custom" | "review";
  target_key: string;
};

const SYSTEM_PROMPT = `You read short user instructions about where receipts should go and map them onto a fixed list of items.

You will be given:
1. A list of ITEMS (id, title, merchant, category) — these are detected receipts/documents from a single uploaded image.
2. A list of CUSTOM SECTIONS the user has created (id, name).
3. Built-in sections (fixed): household, travel, properties, staff, events, finance, legal, personal, vendors, health.
4. The user's INSTRUCTION sentence in their own language.

Your job: match merchants in the instruction to items in the list, and pick the section the user wants for each match.

Rules:
- Only include items the instruction actually mentions (by merchant name, brand, or close paraphrase).
- For each match, choose target_kind="builtin" and target_key=<section enum> when the user named a built-in section.
- Choose target_kind="custom" and target_key=<custom section id> when the user named a custom section by name.
- Choose target_kind="review" when the user explicitly says to send it back to Review / Unsorted.
- If you're not confident about an item, do not include it.
- Output via the apply_sort tool only. No prose.`;

const SORT_TOOL: Anthropic.Messages.Tool = {
  name: "apply_sort",
  description: "Apply a mapping of items to target sections.",
  input_schema: {
    type: "object",
    properties: {
      decisions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            item_id: { type: "string" },
            target_kind: {
              type: "string",
              enum: ["builtin", "custom", "review"],
            },
            target_key: { type: "string" },
          },
          required: ["item_id", "target_kind", "target_key"],
        },
      },
    },
    required: ["decisions"],
  } as Anthropic.Messages.Tool["input_schema"],
};

export async function sortItemsWithInstruction(input: {
  instruction: string;
  items: Array<{
    id: string;
    title: string;
    merchant: string | null;
    category: string | null;
  }>;
  customSections: Array<{ id: string; name: string }>;
}): Promise<SortDecision[] | null> {
  const client = getAnthropic();
  if (!client) return null;

  const message = [
    `ITEMS (id · title · merchant · category):`,
    ...input.items.map(
      (i) =>
        `- ${i.id} · ${i.title} · ${i.merchant ?? "(no merchant)"} · ${i.category ?? "(no category)"}`,
    ),
    "",
    "CUSTOM SECTIONS (id · name):",
    ...(input.customSections.length === 0
      ? ["(none)"]
      : input.customSections.map((c) => `- ${c.id} · ${c.name}`)),
    "",
    `BUILT-IN SECTIONS: ${BUILTIN_SECTIONS.join(", ")}`,
    "",
    `INSTRUCTION:`,
    input.instruction,
  ].join("\n");

  const model = getModel();
  let response: Anthropic.Messages.Message;
  const startedAt = Date.now();
  try {
    response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [SORT_TOOL],
      tool_choice: { type: "tool", name: "apply_sort" },
      messages: [{ role: "user", content: message }],
    });
  } catch (e) {
    recordAiError({
      surface: "sort-items",
      model,
      latencyMs: Date.now() - startedAt,
      error: e,
    });
    return null;
  }

  if (response.usage) {
    recordAiCall({
      surface: "sort-items",
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      latencyMs: Date.now() - startedAt,
    });
  }

  const toolUse = response.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) return null;

  const input_ = toolUse.input as { decisions?: unknown };
  if (!Array.isArray(input_.decisions)) return null;

  const validIds = new Set(input.items.map((i) => i.id));
  const validCustom = new Set(input.customSections.map((c) => c.id));
  const out: SortDecision[] = [];
  for (const d of input_.decisions) {
    if (!d || typeof d !== "object") continue;
    const o = d as Record<string, unknown>;
    if (typeof o.item_id !== "string" || !validIds.has(o.item_id)) continue;
    if (typeof o.target_kind !== "string") continue;
    if (typeof o.target_key !== "string") continue;
    if (o.target_kind === "builtin" && !BUILTIN_SECTIONS.includes(o.target_key as Section)) continue;
    if (o.target_kind === "custom" && !validCustom.has(o.target_key)) continue;
    if (o.target_kind === "review" && o.target_key !== "review") continue;
    out.push({
      item_id: o.item_id,
      target_kind: o.target_kind as SortDecision["target_kind"],
      target_key: o.target_key,
    });
  }
  return out;
}
