// Formats an upload's structured extraction (extracted_entities.fields) into
// compact key/value lines that get prepended to the raw OCR chunks in the Ask
// retrieval context. The model is told to prefer these clean fields over the
// noisy raw text.
//
// Pure and dependency-free so it can be unit-tested without a database.

/** Merge user corrections over the model's fields when the user verified them. */
export function resolveFields(
  fields: Record<string, unknown> | null | undefined,
  userEdited: Record<string, unknown> | null | undefined,
  userVerified: boolean,
): Record<string, unknown> {
  const base = fields ?? {};
  if (userVerified && userEdited) return { ...base, ...userEdited };
  return base;
}

function scalar(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v).trim();
}

/**
 * Render `fields` as compact "key: value" lines under a one-line header.
 * Empty/null values are dropped. Arrays and one level of nested objects are
 * flattened inline. The whole block is capped at `maxChars` (~200 tokens at
 * the default 800) so structured data never crowds out the raw chunks.
 * Returns "" when there is nothing worth showing.
 */
export function formatStructuredFields(
  docType: string,
  fields: Record<string, unknown>,
  maxChars = 800,
): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;

    if (Array.isArray(value)) {
      const parts = value.map(scalar).filter(Boolean);
      if (parts.length > 0) lines.push(`${key}: ${parts.join(", ")}`);
      continue;
    }

    if (typeof value === "object") {
      const inner = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => {
          const s = scalar(v);
          return s ? `${k}=${s}` : "";
        })
        .filter(Boolean)
        .join(", ");
      if (inner) lines.push(`${key}: ${inner}`);
      continue;
    }

    const s = scalar(value);
    if (s) lines.push(`${key}: ${s}`);
  }

  if (lines.length === 0) return "";

  const header = `Structured fields (${docType}):`;
  let body = lines.join("\n");

  const budget = Math.max(0, maxChars - header.length - 1);
  if (body.length > budget) {
    body = body.slice(0, Math.max(0, budget - 3)).replace(/\s+\S*$/, "") + "...";
  }

  return `${header}\n${body}`;
}

/**
 * Compose the final upload snippet: structured fields first (clean,
 * authoritative), then the raw OCR snippet (background, possibly noisy).
 */
export function composeUploadSnippet(
  structuredBlock: string,
  rawSnippet: string,
): string {
  if (!structuredBlock) return rawSnippet;
  if (!rawSnippet) return structuredBlock;
  return `${structuredBlock}\n\n${rawSnippet}`;
}
