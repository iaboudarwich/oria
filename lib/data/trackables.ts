import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireContext } from "./organizations";
import type { TrackableCategory } from "@/lib/ai/detect-trackable";

export type TrackablePeriod = "once" | "monthly" | "quarterly" | "semi_annually" | "annually";

/** Lifecycle: active by default; wont_do retires a goal/wishlist item the user
 *  decided against (kept, not deleted); done marks it achieved or bought. */
export type TrackableStatus = "active" | "wont_do" | "done";

export type Trackable = {
  id: string;
  organization_id: string;
  source_upload_id: string | null;
  entity_id: string | null;
  category: TrackableCategory;
  title: string;
  vendor: string | null;
  starts_at: string | null;
  ends_at: string | null;
  renewal_date: string | null;
  cost_amount: number | null;
  cost_currency: string | null;
  cost_period: TrackablePeriod | null;
  summary: string | null;
  status: TrackableStatus;
  exclude_from_insights: boolean;
  details: Record<string, unknown>;
  created_by: string;
  created_at: string;
  archived_at: string | null;
};

export async function listTrackables(): Promise<Trackable[]> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("trackables")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .order("renewal_date", { ascending: true, nullsFirst: false });
  return (data ?? []) as Trackable[];
}

/**
 * Create a trackable from detected fields after extraction.
 * Called from the background job pipeline; uses admin client.
 */
export async function createTrackableFromDetection(input: {
  organizationId: string;
  uploadId: string;
  createdBy: string;
  category: TrackableCategory;
  title: string;
  vendor?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  renewal_date?: string | null;
  cost_amount?: number | null;
  cost_currency?: string | null;
  cost_period?: string | null;
  summary?: string | null;
}): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trackables")
    .insert({
      organization_id: input.organizationId,
      source_upload_id: input.uploadId,
      category: input.category,
      title: input.title,
      vendor: input.vendor ?? null,
      starts_at: input.starts_at ?? null,
      ends_at: input.ends_at ?? null,
      renewal_date: input.renewal_date ?? null,
      cost_amount: input.cost_amount ?? null,
      cost_currency: input.cost_currency ?? "USD",
      cost_period: input.cost_period ?? null,
      summary: input.summary ?? null,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

/** Renewal countdown in days. Negative = already expired. */
export function daysUntilRenewal(renewal_date: string | null): number | null {
  if (!renewal_date) return null;
  const diff = new Date(renewal_date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
