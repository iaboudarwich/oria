import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ReminderSuggestion = {
  /** Stable key scoped to this upload. Used in dismissed_suggestions. */
  key: string;
  title: string;
  /** ISO date, the actual event/deadline date */
  target_date: string;
  /** How many days before target_date to fire the reminder */
  default_lead_days: number;
};

/**
 * Derive reminder suggestions from an upload's extracted entities.
 * Pure function, reads from DB, returns suggestions without writing.
 * Filters: past dates, existing reminders, dismissed suggestions.
 */
export async function generateSuggestionsForUpload(
  uploadId: string,
  userId: string,
): Promise<ReminderSuggestion[]> {
  const admin = createAdminClient();

  // ── Fetch entity ───────────────────────────────────────────────────────
  const { data: entity } = await admin
    .from("extracted_entities")
    .select("doc_type, fields, user_edited_fields, user_verified")
    .eq("upload_id", uploadId)
    .maybeSingle();

  if (!entity) return [];

  const fields =
    entity.user_verified && entity.user_edited_fields
      ? {
          ...(entity.fields as Record<string, unknown>),
          ...(entity.user_edited_fields as Record<string, unknown>),
        }
      : (entity.fields as Record<string, unknown>);

  const raw: ReminderSuggestion[] = deriveRaw(entity.doc_type as string, fields, uploadId);

  if (raw.length === 0) return [];

  // ── Filter past dates ─────────────────────────────────────────────────
  const now = new Date();
  const future = raw.filter((s) => {
    const d = new Date(s.target_date);
    return !isNaN(d.getTime()) && d > now;
  });
  if (future.length === 0) return [];

  // ── Filter dismissed ───────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: dismissed } = await supabase
    .from("dismissed_suggestions")
    .select("suggestion_key")
    .eq("user_id", userId);
  const dismissedKeys = new Set(
    ((dismissed ?? []) as { suggestion_key: string }[]).map((r) => r.suggestion_key),
  );
  const notDismissed = future.filter((s) => !dismissedKeys.has(s.key));
  if (notDismissed.length === 0) return [];

  // ── Filter already-created reminders ─────────────────────────────────
  // Skip if a reminder with the same source_upload_id already exists
  // with a due_at within 7 days of the suggestion's target_date.
  const { data: existing } = await admin
    .from("reminders")
    .select("due_at")
    .eq("source_upload_id", uploadId);

  const existingDates = ((existing ?? []) as { due_at: string | null }[])
    .map((r) => (r.due_at ? new Date(r.due_at).getTime() : null))
    .filter((t): t is number => t !== null);

  const sevenDaysMs = 7 * 24 * 3600 * 1000;
  const noOverlap = notDismissed.filter((s) => {
    const targetMs = new Date(s.target_date).getTime();
    return !existingDates.some((t) => Math.abs(t - targetMs) < sevenDaysMs);
  });

  // ── Also derive suggestions from trackables for this upload ─────────────
  // Trackable detection may have run async after this function is called,
  // so we query it here too and merge any non-overlapping suggestions.
  try {
    const { data: trackableRows } = await admin
      .from("trackables")
      .select("id, category, title, renewal_date")
      .eq("source_upload_id", uploadId)
      .not("renewal_date", "is", null);

    const { TRACKABLE_LEAD_DAYS } = await import("@/lib/ai/detect-trackable");

    for (const t of (trackableRows ?? []) as Array<{
      id: string;
      category: string;
      title: string;
      renewal_date: string;
    }>) {
      if (!t.renewal_date) continue;
      const targetDate = new Date(t.renewal_date);
      if (isNaN(targetDate.getTime()) || targetDate <= now) continue;
      const key = `${uploadId}:trackable:${t.id}`;
      if (dismissedKeys.has(key)) continue;
      const targetMs = targetDate.getTime();
      if (existingDates.some((d) => Math.abs(d - targetMs) < sevenDaysMs)) continue;
      const leadDays = TRACKABLE_LEAD_DAYS[t.category as keyof typeof TRACKABLE_LEAD_DAYS] ?? 30;
      noOverlap.push({
        key,
        title: t.title,
        target_date: t.renewal_date,
        default_lead_days: leadDays,
      });
    }
  } catch {
    // Best-effort, trackables table may not exist yet
  }

  return noOverlap;
}

// ── Raw suggestion derivation by doc_type ─────────────────────────────────────

function str(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function deriveRaw(
  docType: string,
  f: Record<string, unknown>,
  uploadId: string,
): ReminderSuggestion[] {
  const suggestions: ReminderSuggestion[] = [];

  switch (docType) {
    case "lease": {
      if (f.end_date) {
        // Default 60 days; if renewal_terms mentions a notice period, honor it.
        let leadDays = 60;
        const terms = str(f.renewal_terms).toLowerCase();
        const match = terms.match(/(\d+)\s*(?:day|days)/);
        if (match) leadDays = Math.min(365, Math.max(7, parseInt(match[1], 10)));
        suggestions.push({
          key: `${uploadId}:lease_end`,
          title: `Lease ends${f.property_address ? `, ${str(f.property_address).slice(0, 50)}` : ""}`,
          target_date: str(f.end_date),
          default_lead_days: leadDays,
        });
      }
      break;
    }
    case "contract": {
      if (f.renewal_date) {
        suggestions.push({
          key: `${uploadId}:contract_renewal`,
          title: `Contract renews${f.contract_type ? ` (${str(f.contract_type)})` : ""}`,
          target_date: str(f.renewal_date),
          default_lead_days: 30,
        });
      }
      if (f.termination_date) {
        suggestions.push({
          key: `${uploadId}:contract_termination`,
          title: `Contract terminates${f.contract_type ? ` (${str(f.contract_type)})` : ""}`,
          target_date: str(f.termination_date),
          default_lead_days: 30,
        });
      }
      break;
    }
    case "flight": {
      if (f.departure_datetime) {
        const dest = str(f.destination_airport) || str(f.airline);
        suggestions.push({
          key: `${uploadId}:flight_depart`,
          title: `Flight${dest ? ` to ${dest}` : ""} departs`,
          // departure_datetime is ISO datetime, normalize to date
          target_date: str(f.departure_datetime).slice(0, 10),
          default_lead_days: 1,
        });
      }
      break;
    }
    case "prescription": {
      if (f.fill_date) {
        // Typical Rx is 30 days. Suggest refill 5 days before running out.
        suggestions.push({
          key: `${uploadId}:rx_refill`,
          title: `Refill ${str(f.medication) || "prescription"}`,
          target_date: addDays(str(f.fill_date), 30),
          default_lead_days: 5,
        });
      }
      break;
    }
    case "invoice": {
      if (f.due_date) {
        suggestions.push({
          key: `${uploadId}:invoice_due`,
          title: `Invoice due${f.vendor ? `, ${str(f.vendor).slice(0, 50)}` : ""}`,
          target_date: str(f.due_date),
          default_lead_days: 3,
        });
      }
      break;
    }
    // receipt, statement, id_document, generic → no suggestions
    default:
      break;
  }

  return suggestions;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
