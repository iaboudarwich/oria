import "server-only";

import type {
  DocumentType,
  Section,
} from "@/lib/supabase/types";
import type { SmartSection } from "@/lib/ai/extract";

/**
 * Final section assignment for an extracted item.
 *
 * The model proposes a `suggested_section` per item, but it sometimes
 * picks badly: a vehicle registration RENEWAL is technically about a
 * car (travel) but the user is paying a bill — the right section is
 * Finance. The same goes for any financial doc the model might tag
 * elsewhere (a healthcare invoice, a property tax bill).
 *
 * Server-side override rules (applied after extraction):
 *   1. smart_section="bills" → section="finance" — bills are always
 *      payable items, regardless of what they're for.
 *   2. document_type IN {invoice, receipt} → section="finance" — both
 *      are financial documents by definition.
 *   3. Otherwise honour the model's suggestion (or the section hint
 *      passed in from the calling page).
 *
 * Returns null when the caller should leave the item Unsorted (model
 * had low confidence + no override applied).
 */
export function resolveFinalSection(input: {
  suggested: Section | null;
  documentType: DocumentType | string | null;
  smartSection: SmartSection | null;
  sectionHint: Section | null;
}): Section | null {
  // Hard overrides: bills and money-shaped docs land in Finance.
  if (input.smartSection === "bills") return "finance";
  if (
    input.documentType === "invoice" ||
    input.documentType === "receipt"
  ) {
    return "finance";
  }
  // Otherwise: prefer the model's suggestion, fall back to caller hint.
  return input.suggested ?? input.sectionHint ?? null;
}
