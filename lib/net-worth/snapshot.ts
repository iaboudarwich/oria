import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getLocalParts } from "@/lib/utils/tz";
import { logAuditEvent } from "@/lib/data/audit-log";
import { computeNetWorth, type AssetInput } from "./compute";

/**
 * Net worth snapshots ride the hourly daily-loop cron. For every org a user
 * OWNS, at that owner's local midnight, we write one snapshot row for the local
 * day. The unique (organization_id, snapshot_date) constraint makes a second
 * pass in the same hour a no-op, so the cron is safe to retry.
 *
 * Snapshots are org-scoped (not per-user): a personal account and a business
 * account each get their own line, matching the Round 16.8 scope model. We only
 * snapshot orgs that hold at least one live holding, so an empty org never
 * litters the history with zero rows.
 */
export async function takeNetWorthSnapshots(
  now: Date,
): Promise<{ snapshots: number }> {
  const admin = createAdminClient();
  let snapshots = 0;

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, timezone");
  if (!profiles?.length) return { snapshots };

  // Owners only: a snapshot is taken once per owned org at the owner's midnight.
  const { data: memberships } = await admin
    .from("memberships")
    .select("user_id, organization_id, role");
  const ownerOrgs: Array<{ userId: string; orgId: string }> = [];
  for (const m of memberships ?? []) {
    if (m.role === "owner") {
      ownerOrgs.push({ userId: m.user_id as string, orgId: m.organization_id as string });
    }
  }
  if (!ownerOrgs.length) return { snapshots };

  const tzByUser = new Map<string, string | null>();
  for (const p of profiles) tzByUser.set(p.id as string, (p.timezone as string | null) ?? null);

  for (const { userId, orgId } of ownerOrgs) {
    const tz = tzByUser.get(userId) ?? null;
    const { hour, ymd } = getLocalParts(now, tz);
    if (hour !== 0) continue; // owner's local midnight only

    const { data: assets } = await admin
      .from("manual_assets")
      .select("kind, amount, currency, exclude_from_insights")
      .eq("organization_id", orgId)
      .is("archived_at", null);
    if (!assets?.length) continue; // nothing to snapshot

    const nw = computeNetWorth(assets as AssetInput[]);
    const { error } = await admin
      .from("net_worth_snapshots")
      .upsert(
        {
          organization_id: orgId,
          snapshot_date: ymd,
          total_assets: nw.totalAssets,
          total_liabilities: nw.totalLiabilities,
          net_worth: nw.netWorth,
          currency: nw.currency,
          breakdown: nw.byKind,
        },
        { onConflict: "organization_id,snapshot_date" },
      );
    if (error) continue;
    snapshots += 1;
    await logAuditEvent({
      userId,
      action: "net_worth.snapshot_created",
      organizationId: orgId,
      resourceType: "net_worth_snapshot",
      metadata: { snapshot_date: ymd, net_worth: nw.netWorth, currency: nw.currency },
    });
  }

  return { snapshots };
}
