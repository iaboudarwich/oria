import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type WorkspaceRouting = "personal" | "work" | "auto";

export type WorkspaceOrgs = {
  personalOrgId: string | null;
  workOrgId: string | null;
};

/**
 * Resolve the user's default Personal and Work organization ids (the targets
 * for workspace routing). Prefers is_default_for_kind, falls back to the
 * earliest membership in each kind.
 */
export async function resolveWorkspaceOrgs(userId: string): Promise<WorkspaceOrgs> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("memberships")
    .select("organization_id, created_at, organizations(id, parent_kind, is_default_for_kind)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  type Row = {
    organization_id: string;
    organizations:
      | { id: string; parent_kind: string | null; is_default_for_kind: boolean | null }
      | { id: string; parent_kind: string | null; is_default_for_kind: boolean | null }[]
      | null;
  };

  let personalOrgId: string | null = null;
  let workOrgId: string | null = null;

  for (const row of (data as Row[] | null) ?? []) {
    const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
    if (!org) continue;
    if (org.parent_kind === "work") {
      if (!workOrgId || org.is_default_for_kind) workOrgId = org.id;
    } else {
      if (!personalOrgId || org.is_default_for_kind) personalOrgId = org.id;
    }
  }
  return { personalOrgId, workOrgId };
}

// Corporate signals that push an email toward the Work workspace in auto mode.
const CORPORATE_KEYWORDS = [
  "invoice",
  "contract",
  "msa",
  "nda",
  "statement of work",
  "rfp",
  "purchase order",
  "remittance",
  "payable",
];

/**
 * Decide the target org for one email given the connection's routing mode.
 * `auto` looks for corporate signals in the sender + subject and routes those
 * to Work, everything else to Personal. Falls back to `fallbackOrgId` when the
 * preferred workspace is missing.
 */
export function chooseOrgForEmail(input: {
  routing: WorkspaceRouting;
  orgs: WorkspaceOrgs;
  sender: string;
  subject: string;
  fallbackOrgId: string;
}): string {
  const { routing, orgs, fallbackOrgId } = input;
  if (routing === "personal") return orgs.personalOrgId ?? fallbackOrgId;
  if (routing === "work") return orgs.workOrgId ?? orgs.personalOrgId ?? fallbackOrgId;

  // auto
  const hay = `${input.sender} ${input.subject}`.toLowerCase();
  const looksCorporate = CORPORATE_KEYWORDS.some((k) => hay.includes(k));
  if (looksCorporate && orgs.workOrgId) return orgs.workOrgId;
  return orgs.personalOrgId ?? fallbackOrgId;
}
