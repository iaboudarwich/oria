import "server-only";
import { infraComplete } from "@/lib/ai-providers";
import type { FieldDef } from "@/lib/data/entities";

/**
 * Given a name + optional description, suggest a sensible field schema
 * for a custom entity type. Returns an array of FieldDef objects.
 * Falls back to a minimal [{key:"notes",label:"Notes",type:"long_text"}]
 * on any failure.
 */
export async function suggestEntityTypeSchema(
  name: string,
  description: string,
): Promise<FieldDef[]> {
  const prompt = `You are helping a user create a custom data type called "${name}".
${description ? `Description: ${description}` : ""}

Suggest 4–8 useful fields for tracking "${name}" entities.

Return ONLY valid JSON, an array of field objects:
[{"key":"...", "label":"...", "type":"...", "required":false}]

Field types: text | number | date | currency | enum | boolean | long_text
For enum, add "options": ["opt1", "opt2", ...]
Keys must be snake_case with no spaces.

Examples for "Vehicle": make(text), model(text), year(number), vin(text), color(text), purchase_date(date)
Examples for "Property": address(text), beds(number), baths(number), purchase_date(date), purchase_price(currency)
Examples for "Insurance Policy": provider(text), policy_number(text), premium(currency), renewal_date(date), coverage_type(enum)

Respond with ONLY the JSON array, nothing else.`;

  try {
    const msg = await infraComplete([{ role: "user", content: prompt }], {
      tier: "fast",
      maxTokens: 600,
    });
    const raw = msg?.content.trim() || "[]";
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned) as FieldDef[];
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultSchema();
    // Validate each field has required keys
    return parsed.filter(
      (f) =>
        typeof f.key === "string" &&
        typeof f.label === "string" &&
        typeof f.type === "string",
    );
  } catch {
    return defaultSchema();
  }
}

function defaultSchema(): FieldDef[] {
  return [
    { key: "description", label: "Description", type: "text", required: false },
    { key: "notes", label: "Notes", type: "long_text", required: false },
    { key: "date", label: "Date", type: "date", required: false },
  ];
}
