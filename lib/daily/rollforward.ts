import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SignalReminder } from "./signals";

/**
 * F6: carry yesterday's unfinished items forward to today.
 *
 * Mechanism: AUTOMATIC and idempotent. Each overdue, not-done reminder is
 * materialized as a `rollover` card on today's surface. Idempotency is
 * guaranteed two ways: the pure builder below skips any reminder already
 * carried for the same day, and the DB partial-unique index
 * (user, org, card_kind, source_id, for_date) makes a duplicate insert a no-op.
 * Running the roll-forward any number of times in a day produces one card per
 * unfinished item, never more.
 */

export type RolloverCardRow = {
  user_id: string;
  organization_id: string;
  card_kind: "rollover";
  source_table: "reminders";
  source_id: string;
  for_date: string;
  title: string;
  href: string;
};

/**
 * Pure: given the overdue reminders and the set of source ids already carried
 * for `forDate`, return the rollover rows that still need inserting. Re-running
 * with the prior output's ids in `alreadyCarried` returns an empty list.
 */
export function computeRolloverCards(
  overdue: SignalReminder[],
  alreadyCarried: Set<string>,
  forDate: string,
  userId: string,
  organizationId: string,
): RolloverCardRow[] {
  const rows: RolloverCardRow[] = [];
  const seen = new Set<string>(alreadyCarried);
  for (const r of overdue) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    rows.push({
      user_id: userId,
      organization_id: organizationId,
      card_kind: "rollover",
      source_table: "reminders",
      source_id: r.id,
      for_date: forDate,
      title: r.title,
      href: r.uploadId ? `/dashboard/uploads/${r.uploadId}` : "/dashboard",
    });
  }
  return rows;
}

/**
 * Apply the roll-forward for one user+space. Reads which reminders are already
 * carried for the day, computes the gap, and inserts only the new ones with an
 * ignore-on-conflict so concurrent runs cannot duplicate. Returns the count
 * actually carried this pass.
 */
export async function applyRollForward(
  admin: SupabaseClient,
  userId: string,
  organizationId: string,
  overdue: SignalReminder[],
  forDate: string,
): Promise<number> {
  if (!overdue.length) return 0;
  const { data: existing } = await admin
    .from("today_pinned_cards")
    .select("source_id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("card_kind", "rollover")
    .eq("for_date", forDate);
  const alreadyCarried = new Set<string>(
    (existing ?? []).map((r) => r.source_id as string).filter(Boolean),
  );
  const rows = computeRolloverCards(overdue, alreadyCarried, forDate, userId, organizationId);
  if (!rows.length) return 0;
  await admin.from("today_pinned_cards").upsert(rows, {
    onConflict: "user_id,organization_id,card_kind,source_id,for_date",
    ignoreDuplicates: true,
  });
  return rows.length;
}
