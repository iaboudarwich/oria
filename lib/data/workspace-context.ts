import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireContext } from "./organizations";

export type WorkspaceContext = {
  organization_id: string;
  description: string | null;
  ai_instructions: string | null;
  preferred_metrics: string[];
  preferred_report_style: string | null;
  updated_at: string | null;
};

/**
 * Standing instructions and description for the AI agent of the active
 * Workspace. Office orgs only. Returns null for personal/circle orgs and
 * if the row hasn't been created yet (the agent will fall back to defaults
 * in that case). Soft-fails on missing table so deploys before the
 * 0020 migration is applied don't crash the page.
 *
 * Request-scoped: reads the active org from cookies. Use
 * `getWorkspaceContextByOrgId` from anything that runs in `after()`.
 */
export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  const ctx = await requireContext();
  if (ctx.organization.kind !== "office") return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_context")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (error || !data) return null;
  return normalize(data as RawRow);
}

/**
 * Same data, but takes the org id directly and uses the admin client.
 * Safe to call from background work (after(), background_jobs runners)
 * where cookies are no longer accessible. Caller is responsible for
 * making sure the orgId is one the user is allowed to read from.
 */
export async function getWorkspaceContextByOrgId(
  organizationId: string,
): Promise<WorkspaceContext | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workspace_context")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data) return null;
  return normalize(data as RawRow);
}

type RawRow = {
  organization_id: string;
  description: string | null;
  ai_instructions: string | null;
  preferred_metrics: unknown;
  preferred_report_style: string | null;
  updated_at: string | null;
};

function normalize(row: RawRow): WorkspaceContext {
  return {
    organization_id: row.organization_id,
    description: row.description,
    ai_instructions: row.ai_instructions,
    preferred_metrics: Array.isArray(row.preferred_metrics)
      ? row.preferred_metrics.filter((m): m is string => typeof m === "string")
      : [],
    preferred_report_style: row.preferred_report_style,
    updated_at: row.updated_at,
  };
}
