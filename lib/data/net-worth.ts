"use server";

import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { enforceActiveOrg } from "./scope";
import { logAuditEvent } from "./audit-log";
import { revalidatePath } from "next/cache";
import { computeNetWorth, type ManualAssetKind, type NetWorth } from "@/lib/net-worth/compute";

export type ManualAsset = {
  id: string;
  organization_id: string;
  created_by: string;
  kind: ManualAssetKind;
  label: string;
  amount: number;
  currency: string;
  as_of: string | null;
  notes: string | null;
  exclude_from_insights: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type NetWorthSnapshot = {
  snapshot_date: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  currency: string;
  breakdown: Record<string, number>;
};

const ASSET_COLUMNS =
  "id, organization_id, created_by, kind, label, amount, currency, as_of, notes, exclude_from_insights, created_at, updated_at, archived_at";

/** All live (non-archived) manual holdings in the active org. */
export async function listManualAssets(): Promise<ManualAsset[]> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("manual_assets")
    .select(ASSET_COLUMNS)
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  return enforceActiveOrg(
    (data ?? []) as ManualAsset[],
    ctx.organization.id,
    "listManualAssets",
  ) as ManualAsset[];
}

/** Current net worth for the active org, computed from live holdings. */
export async function currentNetWorth(): Promise<NetWorth> {
  const assets = await listManualAssets();
  return computeNetWorth(
    assets.map((a) => ({
      kind: a.kind,
      amount: a.amount,
      currency: a.currency,
      exclude_from_insights: a.exclude_from_insights,
    })),
  );
}

/** Snapshot history for the active org, oldest first (for the line chart). */
export async function listNetWorthSnapshots(limit = 90): Promise<NetWorthSnapshot[]> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("net_worth_snapshots")
    .select(
      "organization_id, snapshot_date, total_assets, total_liabilities, net_worth, currency, breakdown",
    )
    .eq("organization_id", ctx.organization.id)
    .order("snapshot_date", { ascending: false })
    .limit(limit);
  const rows = enforceActiveOrg(
    (data ?? []) as Array<NetWorthSnapshot & { organization_id: string }>,
    ctx.organization.id,
    "listNetWorthSnapshots",
  ) as NetWorthSnapshot[];
  return rows.slice().reverse();
}

const VALID_KINDS = new Set<ManualAssetKind>([
  "cash",
  "crypto",
  "investment",
  "property",
  "vehicle",
  "other",
  "debt",
]);

type AssetResult = { ok: true; id: string } | { ok: false; error: string };

/** Add a manual holding. Audited; scoped to the active org via RLS. */
export async function createManualAsset(input: {
  kind: string;
  label: string;
  amount: number;
  currency?: string;
  asOf?: string | null;
  notes?: string | null;
}): Promise<AssetResult> {
  try {
    const ctx = await requireContext();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not signed in." };

    const kind = input.kind as ManualAssetKind;
    if (!VALID_KINDS.has(kind)) return { ok: false, error: "Unknown holding type." };
    const label = input.label.trim();
    if (!label) return { ok: false, error: "Give the holding a name." };
    if (!Number.isFinite(input.amount)) return { ok: false, error: "Enter an amount." };

    const { data, error } = await supabase
      .from("manual_assets")
      .insert({
        organization_id: ctx.organization.id,
        created_by: user.id,
        kind,
        label,
        amount: input.amount,
        currency: (input.currency ?? "USD").trim().toUpperCase() || "USD",
        as_of: input.asOf ?? null,
        notes: input.notes?.trim() || null,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Could not save." };

    await logAuditEvent({
      userId: user.id,
      action: "manual_asset.created",
      organizationId: ctx.organization.id,
      resourceType: "manual_asset",
      resourceId: data.id as string,
      metadata: { kind, currency: input.currency ?? "USD" },
    });
    revalidatePath("/dashboard/net-worth");
    return { ok: true, id: data.id as string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/** Soft-archive a manual holding (it leaves net worth immediately). */
export async function archiveManualAsset(id: string): Promise<{ ok: boolean }> {
  try {
    const ctx = await requireContext();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };
    const { error } = await supabase
      .from("manual_assets")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", ctx.organization.id);
    if (error) return { ok: false };
    await logAuditEvent({
      userId: user.id,
      action: "manual_asset.archived",
      organizationId: ctx.organization.id,
      resourceType: "manual_asset",
      resourceId: id,
    });
    revalidatePath("/dashboard/net-worth");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Toggle whether a holding counts toward net worth + insights. */
export async function setAssetExcluded(id: string, excluded: boolean): Promise<{ ok: boolean }> {
  try {
    const ctx = await requireContext();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };
    const { error } = await supabase
      .from("manual_assets")
      .update({ exclude_from_insights: excluded, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", ctx.organization.id);
    if (error) return { ok: false };
    await logAuditEvent({
      userId: user.id,
      action: "manual_asset.updated",
      organizationId: ctx.organization.id,
      resourceType: "manual_asset",
      resourceId: id,
      metadata: { exclude_from_insights: excluded },
    });
    revalidatePath("/dashboard/net-worth");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
