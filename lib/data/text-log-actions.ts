"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireContext } from "./organizations";
import { extractFromText } from "@/lib/ai/text-extract";
import {
  AUTO_FILE_CONFIDENCE,
  type SmartSection,
} from "@/lib/ai/extract";
import { resolveFinalSection } from "./section-routing";
import { recordLearningEvent } from "./learning";
import { recordSystemEvent } from "./system-events";
import { rateLimit, RATE_PRESETS } from "@/lib/rate-limit";
import { proposeAutoRemindersForItems } from "./auto-reminders";
import type { Section } from "@/lib/supabase/types";

/**
 * Quick-log from typed text.
 *
 * Counterpart to uploadFile: takes a short note the user typed into a
 * section (Diet, Bills, the generic section view) and turns it into
 * memory_items rows. No file involved. upload_id stays null.
 *
 * Section + smart-section context come from the calling page. The
 * model can still override based on content (e.g. user types "rent
 * due June 1" on the Diet page → still produces a bills item).
 *
 * Resolves relative dates ("yesterday", "next Friday") against the
 * user's IANA timezone + their local "now". captured client-side
 * and forwarded so the meal lands on the right day regardless of
 * where the function instance runs.
 */

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

const MIN_TEXT_LEN = 5;
const MAX_TEXT_LEN = 2000;

export type LogFromTextInput = {
  text: string;
  section?: Section | string | null;
  smart_section?: SmartSection | null;
  custom_section_id?: string | null;
  custom_section_name?: string | null;
  timezone?: string;
  nowISO?: string;
};

export type LogFromTextResult =
  | {
      ok: true;
      count: number;
      itemIds: string[];
      summary: string;
    }
  | { ok: false; error: string };

export async function logFromText(
  input: LogFromTextInput,
): Promise<LogFromTextResult> {
  const ctx = await requireContext();
  const text = (input.text ?? "").trim();
  if (text.length < MIN_TEXT_LEN) {
    return {
      ok: false,
      error: "Type a few more words so I can pick up what to log.",
    };
  }
  if (text.length > MAX_TEXT_LEN) {
    return {
      ok: false,
      error: `That note is long (${text.length} chars). Keep it under ${MAX_TEXT_LEN}.`,
    };
  }

  // Burst limit. typed-text is cheaper than file extraction but still
  // a Claude call. Reuse the upload preset (20/min).
  const burst = rateLimit({
    key: `text-log:${ctx.profile.id}`,
    ...RATE_PRESETS.upload(),
  });
  if (!burst.ok) return { ok: false, error: burst.message };

  // Resolve the typed section/smart-section hint, ignoring junk values.
  const sectionHint = isBuiltinSection(input.section)
    ? (input.section as Section)
    : null;
  const smartHint: SmartSection | null =
    input.smart_section === "diet" || input.smart_section === "bills"
      ? input.smart_section
      : null;

  const result = await extractFromText({
    text,
    section: sectionHint,
    smartSection: smartHint,
    customSectionName: input.custom_section_name ?? null,
    timezone: input.timezone ?? "UTC",
    nowISO: input.nowISO ?? new Date().toISOString(),
  });

  if (result.kind === "skipped") {
    return {
      ok: false,
      error:
        result.reason === "model_unavailable"
          ? "AI is offline right now. Try again in a minute."
          : "I couldn't tell what to log from that. Try a little more detail.",
    };
  }
  if (result.result.items.length === 0) {
    return {
      ok: false,
      error: "Nothing actionable to log there.",
    };
  }

  const userNowISO = input.nowISO ?? new Date().toISOString();
  const itemRows = result.result.items.map((item) => {
    // Mirror the rules in upload-intelligence.ts so typed entries
    // and upload-derived entries behave identically downstream.
    const smartSection = item.smart_section ?? smartHint ?? null;
    // For diet, ALWAYS force occurred_at to the user's local "now".
    // the model can't know when the user actually ate, and the Today
    // view depends on this being right.
    let occurredAt: string | null;
    if (smartSection === "diet") {
      occurredAt = userNowISO;
    } else {
      occurredAt = item.occurred_at ?? null;
    }
    // Bills/invoices/receipts always route to Finance, regardless of
    // what the model suggested. Otherwise honour model > page hint.
    const suggested =
      item.confidence >= AUTO_FILE_CONFIDENCE ? item.suggested_section : null;
    const effectiveSection: Section | null = resolveFinalSection({
      suggested,
      documentType: item.document_type,
      smartSection,
      sectionHint,
    });
    const effectiveCustomId = input.custom_section_id ?? null;

    return {
      organization_id: ctx.organization.id,
      upload_id: null,
      document_type: item.document_type,
      section: effectiveCustomId ? null : effectiveSection,
      custom_section_id: effectiveCustomId,
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
      raw_text: item.raw_text || text,
      entities: item.entities,
      facts: {
        action_items: item.action_items,
        suggested_section: item.suggested_section,
        source: "typed",
        user_typed: text.slice(0, 500),
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

  const admin = createAdminClient();
  const insertRes = await admin
    .from("memory_items")
    .insert(itemRows)
    .select("id");
  if (insertRes.error || (insertRes.data ?? []).length === 0) {
    const msg =
      insertRes.error?.message ?? "memory_items insert returned 0 rows";
    void recordSystemEvent({
      kind: "upload.failed",
      severity: "error",
      message: msg,
      context: {
        stage: "text_log_insert",
        text: text.slice(0, 300),
        items_attempted: itemRows.length,
      },
      organizationId: ctx.organization.id,
      actorId: ctx.profile.id,
    });
    return {
      ok: false,
      error: "I read your note but couldn't save it. Try again.",
    };
  }

  const insertedIds = (insertRes.data as Array<{ id: string }>).map((r) => r.id);

  // Auto-reminders for bills / contracts / future events. Background.
  const orgId = ctx.organization.id;
  after(async () => {
    await proposeAutoRemindersForItems({
      itemIds: insertedIds,
      organizationId: orgId,
    });
  });

  // Telemetry. feeds the "you've asked before" panel.
  void recordLearningEvent({
    organizationId: ctx.organization.id,
    actorId: ctx.profile.id,
    kind: "search.queried",
    payload: {
      q: text.slice(0, 200),
      via: "text-log",
      hits: { items: insertedIds.length },
    },
  });

  // Reflect new records in the active surfaces.
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard/diet");
  revalidatePath("/dashboard/bills");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/reminders");
  if (sectionHint) revalidatePath(`/dashboard/sections/${sectionHint}`);
  if (input.custom_section_id) {
    revalidatePath(`/dashboard/sections/${input.custom_section_id}`);
  }

  const first = result.result.items[0];
  const summary =
    insertedIds.length === 1
      ? `Logged · ${first.title}`
      : `Logged · ${insertedIds.length} items`;
  return { ok: true, count: insertedIds.length, itemIds: insertedIds, summary };
}

function isBuiltinSection(s: unknown): boolean {
  return typeof s === "string" && BUILTIN_SECTIONS.includes(s as Section);
}
