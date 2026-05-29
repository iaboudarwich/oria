import "server-only";

import { AUTO_FILE_CONFIDENCE, type ExtractedItem } from "@/lib/ai/extract";
import { resolveFinalSection } from "./section-routing";
import type { Section } from "@/lib/supabase/types";

/**
 * Turn the AI's extracted items into the rows we insert into
 * `memory_items`. This is the deterministic core of the upload pipeline.
 * the same logic used to live inline inside `processUpload`, where it
 * couldn't be unit-tested without a live Supabase + Anthropic round-trip.
 *
 * Pulling it out (pure function, no I/O) lets us assert the rules that
 * actually matter for correctness:
 *
 *   • ORG SCOPE. every row is stamped with the upload's organization_id,
 *     so an upload in one space can never seed an item in another. This
 *     is the load-bearing invariant for multi-tenant isolation; it's
 *     enforced here and asserted in the tests.
 *   • SECTION ROUTING. bills / receipts / invoices are forced to Finance;
 *     low-confidence suggestions fall through to Unsorted (null section).
 *   • DIET DATE OVERRIDE. meals are dated to the upload moment, not to
 *     whatever date the model read off the photo (EXIF, a printed date),
 *     so the Today view and "calories today" aggregates stay correct.
 *
 * Behaviour is identical to the previous inline mapping; `now` is a
 * parameter only so tests are deterministic (production passes the real
 * current time).
 */

export type MemoryItemRow = {
  organization_id: string;
  upload_id: string;
  document_type: ExtractedItem["document_type"];
  section: Section | null;
  language: string | null;
  is_handwritten: boolean;
  confidence: number;
  title: string;
  summary: string | null;
  merchant: string | null;
  amount_value: string | null;
  amount_currency: string | null;
  amount_normalized: number | null;
  occurred_at: string | null;
  location: string | null;
  payment_method: string | null;
  category: string | null;
  items_purchased: string[];
  raw_text: string | null;
  entities: ExtractedItem["entities"];
  facts: Record<string, unknown>;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  is_recurring: boolean | null;
  recurring_interval: string | null;
  direction: ExtractedItem["direction"];
  smart_section: ExtractedItem["smart_section"];
};

export function buildMemoryItemRows(input: {
  items: ExtractedItem[];
  organizationId: string;
  uploadId: string;
  /** Forces Diet/Bills when the upload came in via those pages. */
  smartSectionHint?: "diet" | "bills" | null;
  /** Free-form note the user typed at upload time. */
  userDescription?: string | null;
  /** ISO instant used as the meal time for diet items. Defaults to now. */
  now?: string;
}): MemoryItemRow[] {
  const smartSectionHint = input.smartSectionHint ?? null;
  const userDescription = input.userDescription ?? null;
  const nowISO = input.now ?? new Date().toISOString();

  return input.items.map((item) => {
    const smartSection = item.smart_section ?? smartSectionHint ?? null;
    // Only adopt the model's section when it was confident enough; below
    // the threshold the item lands in Unsorted for the user to place.
    const suggested =
      item.confidence >= AUTO_FILE_CONFIDENCE ? item.suggested_section : null;
    const autoSection = resolveFinalSection({
      suggested,
      documentType: item.document_type,
      smartSection,
      sectionHint: null,
    });

    // Diet: the upload time IS the meal time; ignore any date the model
    // read off the photo. Other smart sections (bills) need the real
    // extracted due date, so they're untouched.
    const occurredAt =
      smartSection === "diet" ? nowISO : (item.occurred_at ?? null);

    return {
      organization_id: input.organizationId,
      upload_id: input.uploadId,
      document_type: item.document_type,
      section: autoSection,
      language: item.language,
      is_handwritten: item.is_handwritten,
      confidence: item.confidence,
      title: item.title,
      summary: item.summary,
      merchant: item.merchant,
      amount_value: item.amount_value,
      amount_currency: item.amount_currency,
      amount_normalized: item.amount_normalized,
      occurred_at: occurredAt,
      location: item.location,
      payment_method: item.payment_method,
      category: item.category,
      items_purchased: item.items_purchased,
      raw_text: item.raw_text || null,
      entities: item.entities,
      facts: {
        action_items: item.action_items,
        suggested_section: item.suggested_section,
        ...(userDescription ? { user_description: userDescription } : {}),
      },
      calories: item.calories,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      is_recurring: item.is_recurring,
      recurring_interval: item.recurring_interval,
      direction: item.direction,
      smart_section: smartSection,
    };
  });
}
