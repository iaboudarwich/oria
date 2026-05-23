import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Centralized scoped-read primitive. Use this for every new query that
 * reads org-owned data so the `.eq("organization_id", ...)` filter is
 * never forgotten or mis-typed.
 *
 *   const q = scopedFrom(supabase, "uploads", ctx.organization.id)
 *     .select("id, filename, created_at")
 *     .order("created_at", { ascending: false });
 *
 * This DOES NOT replace the runtime guard in lib/data/scope.ts. The
 * two together are belt-and-suspenders:
 *   • scopedFrom = compile-time / call-site safety net (every read
 *     starts with the org filter applied)
 *   • enforceActiveOrg = runtime safety net (drop+log any row whose
 *     organization_id slips through wrong)
 *
 * Use both on every list-returning helper.
 */
export function scopedFrom<TClient extends SupabaseClient>(
  supabase: TClient,
  table: string,
  organizationId: string,
) {
  if (!organizationId) {
    // Fail closed. A query without a real org id would otherwise read
    // every row the RLS context permits, which for a service-role
    // admin client is everything.
    throw new Error(
      `scopedFrom("${table}"): missing organizationId — refusing to build a query`,
    );
  }
  // The chain below preserves PostgREST builder behavior; callers add
  // .select(), .order(), .limit(), additional filters, etc.
  return supabase.from(table).select().eq("organization_id", organizationId);
}

/**
 * Multi-org variant for the EXACT three permitted callers:
 *   1. Ask Oria with God's Eye (Personal-owner-in-Personal only)
 *   2. Calendar with cross-space (same gate)
 *   3. Cross-space search (same gate)
 *
 * If you reach for this helper anywhere else, the design's wrong —
 * use scopedFrom against the single active org instead.
 */
export function multiOrgFrom<TClient extends SupabaseClient>(
  supabase: TClient,
  table: string,
  organizationIds: ReadonlyArray<string>,
) {
  if (organizationIds.length === 0) {
    throw new Error(
      `multiOrgFrom("${table}"): empty allowed-org list — refusing to build a query`,
    );
  }
  return supabase
    .from(table)
    .select()
    .in("organization_id", organizationIds as string[]);
}
