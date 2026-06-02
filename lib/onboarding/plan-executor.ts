import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/data/audit-log";
import type { SetupPlan, WorkspacePlan } from "./types";

export type ExecuteResult = { ok: boolean; error?: string; primaryOrgId?: string };

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "space";
  return `${base}-${randomUUID().slice(0, 6)}`;
}

/**
 * Build everything a SetupPlan describes. The user's existing default Personal
 * org absorbs the plan's personal area (renamed, accented, sectioned); each
 * work workspace becomes a new office org. Not a true DB transaction (the JS
 * client has none); instead we track what we create and what we change, and on
 * any failure we compensate, deleting new orgs and restoring the personal org,
 * so the user is never left half-built. Stores the plan and audits it.
 */
export async function executeSetupPlan(input: {
  userId: string;
  plan: SetupPlan;
  source: "initial_setup" | "reconfigure";
}): Promise<ExecuteResult> {
  const admin = createAdminClient();
  const createdOrgIds: string[] = [];

  // The personal org we may rewrite, plus a snapshot to restore on failure.
  const { data: personalRow } = await admin
    .from("organizations")
    .select("id, name, accent_color, template_key")
    .eq("created_by", input.userId)
    .eq("kind", "personal")
    .eq("parent_kind", "personal")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const personal = personalRow as
    | { id: string; name: string; accent_color: string | null; template_key: string | null }
    | null;
  let personalTouched = false;

  async function addSections(orgId: string, ws: WorkspacePlan) {
    const sorted = [...ws.sections].sort((a, b) => a.priority - b.priority);
    for (const s of sorted) {
      await admin
        .from("custom_sections")
        .upsert(
          { organization_id: orgId, name: s.title.slice(0, 60), icon: s.icon, created_by: input.userId },
          { onConflict: "organization_id,name", ignoreDuplicates: true },
        );
    }
  }

  try {
    let firstWorkOrg = true;
    for (const space of input.plan.spaces) {
      if (space.area === "personal" && personal) {
        // Absorb the personal area into the existing default personal org.
        const first = space.workspaces[0];
        await admin
          .from("organizations")
          .update({
            accent_color: first?.accent_color ?? personal.accent_color,
            template_key: "custom", // clears the legacy template gate
          })
          .eq("id", personal.id);
        personalTouched = true;
        for (const ws of space.workspaces) await addSections(personal.id, ws);
      } else {
        // Work area (or personal area with no existing personal org): one org
        // per workspace.
        for (const ws of space.workspaces) {
          const kind = space.area === "work" ? "office" : ws.kind;
          const { data: org, error } = await admin
            .from("organizations")
            .insert({
              slug: slugify(ws.name),
              name: ws.name.slice(0, 60),
              kind,
              parent_kind: space.area === "work" ? "work" : "personal",
              is_default_for_kind: space.area === "work" ? firstWorkOrg : false,
              accent_color: ws.accent_color,
              template_key: "custom",
              created_by: input.userId,
            })
            .select("id")
            .single();
          if (error || !org) throw new Error("org_create_failed");
          const orgId = (org as { id: string }).id;
          createdOrgIds.push(orgId);
          await admin.from("memberships").insert({
            organization_id: orgId,
            user_id: input.userId,
            role: "owner",
          });
          await addSections(orgId, ws);
          if (space.area === "work") firstWorkOrg = false;
        }
      }
    }

    await admin.from("onboarding_setup_plans").insert({
      user_id: input.userId,
      plan: input.plan,
      source: input.source,
    });

    // Mark the account onboarded so the legacy reprompt banner never nags a
    // user who just built their Oria through the new flow.
    if (input.source === "initial_setup") {
      await admin
        .from("profiles")
        .update({ has_completed_guided_onboarding: true })
        .eq("id", input.userId);
    }

    await logAuditEvent({
      userId: input.userId,
      organizationId: personal?.id ?? createdOrgIds[0] ?? null,
      action: input.source === "initial_setup" ? "onboarding_executed" : "setup_reconfigured",
      resourceType: "setup_plan",
      metadata: {
        spaces: input.plan.spaces.length,
        workspaces: input.plan.spaces.reduce((n, s) => n + s.workspaces.length, 0),
      },
    });

    return { ok: true, primaryOrgId: personal?.id ?? createdOrgIds[0] };
  } catch (e) {
    // Compensate: remove created orgs (sections cascade) and restore personal.
    for (const id of createdOrgIds) {
      await admin.from("organizations").delete().eq("id", id);
    }
    if (personalTouched && personal) {
      await admin
        .from("organizations")
        .update({ accent_color: personal.accent_color, template_key: personal.template_key })
        .eq("id", personal.id);
    }
    return { ok: false, error: (e as Error).message };
  }
}
