"use server";

import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { logAuditEvent } from "./audit-log";
import { revalidatePath } from "next/cache";
import type { TrackableCategory } from "@/lib/ai/detect-trackable";
import type { TrackableStatus } from "./trackables";

const MANUAL_CATEGORIES = new Set<TrackableCategory>([
  "subscription",
  "wishlist",
  "goal",
  "membership",
  "insurance",
  "other",
]);

const VALID_STATUS = new Set<TrackableStatus>(["active", "wont_do", "done"]);

type Result = { ok: true; id: string } | { ok: false; error: string };

/**
 * Add a trackable by hand: a subscription you pay, something on your wishlist,
 * a savings goal. Org-scoped via RLS, audited. Subscriptions carry a cost +
 * cadence; wishlist/goal carry a target amount with no renewal.
 */
export async function createTrackableManual(input: {
  category: string;
  title: string;
  vendor?: string | null;
  costAmount?: number | null;
  costCurrency?: string | null;
  costPeriod?: string | null;
  renewalDate?: string | null;
}): Promise<Result> {
  try {
    const ctx = await requireContext();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not signed in." };

    const category = input.category as TrackableCategory;
    if (!MANUAL_CATEGORIES.has(category)) return { ok: false, error: "Unknown type." };
    const title = input.title.trim();
    if (!title) return { ok: false, error: "Give it a name." };

    const { data, error } = await supabase
      .from("trackables")
      .insert({
        organization_id: ctx.organization.id,
        created_by: user.id,
        category,
        title,
        vendor: input.vendor?.trim() || null,
        cost_amount: input.costAmount ?? null,
        cost_currency: (input.costCurrency ?? "USD").trim().toUpperCase() || "USD",
        cost_period: input.costPeriod ?? null,
        renewal_date: input.renewalDate ?? null,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Could not save." };

    await logAuditEvent({
      userId: user.id,
      action: "trackable.created",
      organizationId: ctx.organization.id,
      resourceType: "trackable",
      resourceId: data.id as string,
      metadata: { category, manual: true },
    });
    revalidatePath("/dashboard/trackables");
    return { ok: true, id: data.id as string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/** Set a goal/wishlist/subscription's lifecycle status (active / wont_do / done). */
export async function setTrackableStatus(
  id: string,
  status: string,
): Promise<{ ok: boolean }> {
  try {
    const ctx = await requireContext();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !VALID_STATUS.has(status as TrackableStatus)) return { ok: false };
    const { error } = await supabase
      .from("trackables")
      .update({ status })
      .eq("id", id)
      .eq("organization_id", ctx.organization.id);
    if (error) return { ok: false };
    await logAuditEvent({
      userId: user.id,
      action: "trackable.updated",
      organizationId: ctx.organization.id,
      resourceType: "trackable",
      resourceId: id,
      metadata: { status },
    });
    revalidatePath("/dashboard/trackables");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Toggle whether a trackable's cost counts in spending insights. */
export async function setTrackableExcluded(
  id: string,
  excluded: boolean,
): Promise<{ ok: boolean }> {
  try {
    const ctx = await requireContext();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };
    const { error } = await supabase
      .from("trackables")
      .update({ exclude_from_insights: excluded })
      .eq("id", id)
      .eq("organization_id", ctx.organization.id);
    if (error) return { ok: false };
    await logAuditEvent({
      userId: user.id,
      action: "trackable.updated",
      organizationId: ctx.organization.id,
      resourceType: "trackable",
      resourceId: id,
      metadata: { exclude_from_insights: excluded },
    });
    revalidatePath("/dashboard/trackables");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Soft-archive a trackable (remove it from the list for good). */
export async function archiveTrackable(id: string): Promise<{ ok: boolean }> {
  try {
    const ctx = await requireContext();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };
    const { error } = await supabase
      .from("trackables")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", ctx.organization.id);
    if (error) return { ok: false };
    await logAuditEvent({
      userId: user.id,
      action: "trackable.archived",
      organizationId: ctx.organization.id,
      resourceType: "trackable",
      resourceId: id,
    });
    revalidatePath("/dashboard/trackables");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
