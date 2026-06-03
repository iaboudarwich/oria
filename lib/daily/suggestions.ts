import type { DaySignals, SignalEvent } from "./signals";

/**
 * Suggestions: six patterns, each grounded in a real signal and each wired to a
 * real write on Yes. No pattern is surfaced unless its backing data is present
 * AND its Yes-action has everything it needs to execute. (A seventh pattern was
 * considered and dropped: "stale Record" has no last-touched signal in the
 * schema, and reconnect-needed has no real write-back, so padding to seven
 * would mean inventing fluff. Six grounded beats seven padded.)
 *
 * This module is pure: it maps signals to suggestion descriptors. Copy is
 * localized in the component from `pattern` + `params`; the write is performed
 * server-side from `action`. Nothing here touches the DB or the network.
 */

export type SuggestionPattern =
  | "expiring_trackable"
  | "untracked_recurring"
  | "unfiled_upload"
  | "stuck_upload"
  | "calendar_conflict"
  | "document_action";

export type SuggestionAction =
  | {
      kind: "create_reminder";
      title: string;
      dueAt: string;
      leadDays: number;
      uploadId: string | null;
    }
  | {
      kind: "create_trackable";
      title: string;
      category: string;
      costPeriod: string;
    }
  | { kind: "file_upload"; uploadId: string; section: string }
  | { kind: "requeue_upload"; uploadId: string };

export type Suggestion = {
  /** Stable key for dismissal dedup (dismissed_suggestions.suggestion_key). */
  key: string;
  pattern: SuggestionPattern;
  /** Interpolation params for the localized title/detail. */
  params: Record<string, string | number>;
  action: SuggestionAction;
  /** Lower = more urgent; used to rank and cap the surface. */
  rank: number;
};

const MAX_SUGGESTIONS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Map an extracted document type to a filing section, conservatively. Returns
 * null when there is no confident mapping, so an unfiled-upload suggestion is
 * only ever offered when its Yes-action (set the section) actually knows where
 * to file. Keyword match keeps it resilient to the open doc_type vocabulary.
 */
export function inferSectionFromDocType(docType: string | null): string | null {
  if (!docType) return null;
  const d = docType.toLowerCase();
  const has = (...ks: string[]) => ks.some((k) => d.includes(k));
  if (has("insurance", "policy", "contract", "agreement", "legal", "will", "deed")) return "legal";
  if (has("lease", "mortgage", "property", "tenancy", "utility", "rent")) return "properties";
  if (has("medical", "health", "prescription", "lab", "vaccin", "clinic")) return "health";
  if (has("receipt", "invoice", "bank", "statement", "tax", "payslip", "salary", "bill")) return "finance";
  if (has("passport", "license", "licence", "id_", "identity", "certificate", "birth")) return "personal";
  if (has("flight", "booking", "hotel", "itinerary", "boarding", "travel", "visa")) return "travel";
  return null;
}

/** Two timed events overlap when each starts before the other ends. */
export function detectCalendarConflicts(
  events: SignalEvent[],
): Array<[SignalEvent, SignalEvent]> {
  const timed = events
    .filter((e) => !e.isAllDay && e.endsAt)
    .map((e) => ({ e, s: new Date(e.startsAt).getTime(), n: new Date(e.endsAt as string).getTime() }))
    .filter((x) => !Number.isNaN(x.s) && !Number.isNaN(x.n) && x.n > x.s)
    .sort((a, b) => a.s - b.s);
  const pairs: Array<[SignalEvent, SignalEvent]> = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (timed[j].s >= timed[i].n) break; // sorted: no later event can overlap
      pairs.push([timed[i].e, timed[j].e]);
    }
  }
  return pairs;
}

function mapInterval(interval: string | null): string {
  const v = (interval ?? "").toLowerCase();
  if (v.includes("year") || v.includes("annual")) return "annually";
  if (v.includes("quarter")) return "quarterly";
  if (v.includes("month")) return "monthly";
  return "monthly";
}

/**
 * Build the suggestion list for a user's day. `trackableTitles` is the set of
 * existing Trackable titles (lowercased) so we never suggest tracking a bill
 * that is already tracked. `dismissed` keys are filtered out.
 */
export function computeSuggestions(
  signals: DaySignals,
  trackableTitles: string[],
  dismissed: Set<string>,
): Suggestion[] {
  const out: Suggestion[] = [];
  const titles = trackableTitles.map((t) => t.toLowerCase());

  // 1. Expiring Trackable -> create a renewal reminder.
  for (const t of signals.expiringTrackables) {
    const days = Math.max(
      0,
      Math.round((new Date(t.renewalDate).getTime() - signals.dayStart.getTime()) / DAY_MS),
    );
    out.push({
      key: `expiring_trackable:${t.id}`,
      pattern: "expiring_trackable",
      params: { name: t.title, days },
      action: {
        kind: "create_reminder",
        title: t.title,
        dueAt: new Date(t.renewalDate).toISOString(),
        leadDays: 7,
        uploadId: null,
      },
      rank: days, // soonest first
    });
  }

  // 2. Untracked recurring bill -> create a Trackable. Dedupe by merchant.
  const seenMerchant = new Set<string>();
  for (const b of signals.recurringBills) {
    const merchant = (b.merchant ?? "").trim();
    if (!merchant) continue;
    const ml = merchant.toLowerCase();
    if (seenMerchant.has(ml)) continue;
    seenMerchant.add(ml);
    const alreadyTracked = titles.some((t) => t.includes(ml) || ml.includes(t));
    if (alreadyTracked) continue;
    out.push({
      key: `untracked_recurring:${ml}`,
      pattern: "untracked_recurring",
      params: { merchant },
      action: {
        kind: "create_trackable",
        title: merchant,
        category: "subscription",
        costPeriod: mapInterval(b.interval),
      },
      rank: 40,
    });
  }

  // 3. Unfiled upload -> file into the inferred section (only when inferable).
  for (const u of signals.unfiledUploads) {
    const section = inferSectionFromDocType(signals.docTypeByUpload[u.id] ?? null);
    if (!section) continue;
    out.push({
      key: `unfiled_upload:${u.id}`,
      pattern: "unfiled_upload",
      params: { name: u.title ?? u.filename ?? "document", section },
      action: { kind: "file_upload", uploadId: u.id, section },
      rank: 50,
    });
  }

  // 4. Stuck upload (extraction failed) -> re-queue for processing.
  for (const u of signals.stuckUploads) {
    out.push({
      key: `stuck_upload:${u.id}`,
      pattern: "stuck_upload",
      params: { name: u.title ?? u.filename ?? "document" },
      action: { kind: "requeue_upload", uploadId: u.id },
      rank: 20,
    });
  }

  // 5. Calendar conflict -> reminder to resolve the double-booking.
  for (const [a, b] of detectCalendarConflicts(signals.todayEvents)) {
    const ids = [a.id, b.id].sort();
    out.push({
      key: `calendar_conflict:${ids[0]}:${ids[1]}`,
      pattern: "calendar_conflict",
      params: { a: a.title, b: b.title },
      action: {
        kind: "create_reminder",
        title: `Resolve overlap: ${a.title} and ${b.title}`,
        dueAt: new Date(a.startsAt).toISOString(),
        leadDays: 0,
        uploadId: null,
      },
      rank: 10,
    });
  }

  // 6. Document with a deadline field and no reminder -> create the reminder.
  for (const e of signals.actionableDocuments) {
    const hasReminder = signals.remindersDueToday
      .concat(signals.remindersOverdue)
      .some((r) => r.uploadId === e.uploadId);
    if (hasReminder) continue;
    out.push({
      key: `document_action:${e.uploadId}`,
      pattern: "document_action",
      params: { name: e.title ?? e.docType, label: e.fieldLabel, date: e.fieldDate },
      action: {
        kind: "create_reminder",
        title: e.title ?? `${e.docType} ${e.fieldLabel}`,
        dueAt: new Date(e.fieldDate).toISOString(),
        leadDays: 3,
        uploadId: e.uploadId,
      },
      rank: 30,
    });
  }

  return out
    .filter((s) => !dismissed.has(s.key))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_SUGGESTIONS);
}
