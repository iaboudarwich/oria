import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/data/audit-log";
import { provisioningFor, resolveTemplateKey, type OnboardingIntent } from "./intents";
import type { PlanPatch, SetupPlan, WorkspacePlan } from "./types";

export type ExecuteResult = { ok: boolean; error?: string; primaryOrgId?: string };

function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "space";
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
  /** Classified intent (Round 14.9). Drives the personal org's template_key so
   *  the per-context surface (e.g. Investor) actually renders. */
  intent?: OnboardingIntent;
}): Promise<ExecuteResult> {
  const admin = createAdminClient();
  const createdOrgIds: string[] = [];
  // The template_key the personal org should carry: the intent's hint when its
  // archetype is personal (so an investor's personal org is keyed "investor"),
  // else whatever template the AI chose for the personal workspace.
  const intentHint = input.intent ? provisioningFor(input.intent) : null;

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
  const personal = personalRow as {
    id: string;
    name: string;
    accent_color: string | null;
    template_key: string | null;
  } | null;
  let personalTouched = false;

  async function addSections(orgId: string, ws: WorkspacePlan) {
    const sorted = [...ws.sections].sort((a, b) => a.priority - b.priority);
    for (const s of sorted) {
      await admin.from("custom_sections").upsert(
        {
          organization_id: orgId,
          name: s.title.slice(0, 60),
          icon: s.icon,
          created_by: input.userId,
        },
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
        const personalTemplateKey = resolveTemplateKey(
          intentHint && intentHint.area === "personal"
            ? intentHint.templateKey
            : first?.template_id,
        );
        await admin
          .from("organizations")
          .update({
            accent_color: first?.accent_color ?? personal.accent_color,
            template_key: personalTemplateKey,
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
              // The primary work org carries the intent's template_key so the
              // per-context surface resolves correctly (founder/freelancer ->
              // Business, family office -> Family Office). Later work orgs and
              // non-work-intents keep the AI-chosen template.
              template_key:
                space.area === "work" && firstWorkOrg && intentHint?.area === "work"
                  ? intentHint.templateKey
                  : resolveTemplateKey(ws.template_id),
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
      // Store the plan plus the ids we created, so the F5 undo knows exactly
      // which orgs to remove (the reused personal org is never in this list).
      plan: { ...input.plan, created_org_ids: createdOrgIds },
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

/**
 * Apply a reshape PlanPatch: create new work orgs, add sections, rename, and
 * soft-delete (deleted_at) orgs/sections. Soft-delete makes undo trivial (clear
 * deleted_at). Refuses to delete a user's only/last personal space. Stores the
 * patch (with created_org_ids) in onboarding_setup_plans for the 24h undo, and
 * audits setup_change_executed with the patch types.
 */
export async function executePlanPatch(input: {
  userId: string;
  patch: PlanPatch;
  source: "reconfigure";
}): Promise<ExecuteResult> {
  const admin = createAdminClient();
  const { patch } = input;
  const createdOrgIds: string[] = [];
  const now = new Date().toISOString();

  try {
    // Guard: never soft-delete the user's last active personal space.
    const orgDeletes = patch.deletes.filter((d) => d.kind === "org");
    if (orgDeletes.length > 0) {
      const { data: personalRows } = await admin
        .from("organizations")
        .select("id")
        .eq("created_by", input.userId)
        .eq("parent_kind", "personal")
        .is("deleted_at", null);
      const personalIds = new Set(((personalRows as { id: string }[]) ?? []).map((r) => r.id));
      const deletingPersonal = orgDeletes.filter((d) => personalIds.has(d.id));
      if (deletingPersonal.length > 0 && deletingPersonal.length >= personalIds.size) {
        return { ok: false, error: "cannot_delete_last_space" };
      }
    }

    // 1. Creates: each WorkspacePlan becomes a new office org + membership + sections.
    let firstWorkOrg = true;
    for (const ws of patch.creates) {
      const { data: org, error } = await admin
        .from("organizations")
        .insert({
          slug: slugify(ws.name),
          name: ws.name.slice(0, 60),
          kind: ws.kind === "circle" ? "circle" : "office",
          parent_kind: ws.kind === "circle" ? "personal" : "work",
          is_default_for_kind: ws.kind === "office" ? firstWorkOrg : false,
          accent_color: ws.accent_color,
          template_key: "custom",
          created_by: input.userId,
        })
        .select("id")
        .single();
      if (error || !org) throw new Error("org_create_failed");
      const orgId = (org as { id: string }).id;
      createdOrgIds.push(orgId);
      await admin
        .from("memberships")
        .insert({ organization_id: orgId, user_id: input.userId, role: "owner" });
      const sorted = [...ws.sections].sort((a, b) => a.priority - b.priority);
      for (const s of sorted) {
        await admin.from("custom_sections").upsert(
          {
            organization_id: orgId,
            name: s.title.slice(0, 60),
            icon: s.icon,
            created_by: input.userId,
          },
          { onConflict: "organization_id,name", ignoreDuplicates: true },
        );
      }
      if (ws.kind === "office") firstWorkOrg = false;
    }

    // 2. Section adds into existing orgs.
    for (const add of patch.section_adds) {
      await admin.from("custom_sections").upsert(
        {
          organization_id: add.orgId,
          name: add.section.title.slice(0, 60),
          icon: add.section.icon,
          created_by: input.userId,
        },
        { onConflict: "organization_id,name", ignoreDuplicates: true },
      );
    }

    // 3. Renames (owner-scoped). The old name is preserved in the stored patch.
    // Org renames also regenerate the slug (slugify appends a unique suffix) so
    // the URL slug tracks the display name; sections have no slug.
    for (const r of patch.renames) {
      if (r.kind === "org") {
        const name = r.to.slice(0, 60);
        await admin
          .from("organizations")
          .update({ name, slug: slugify(name) })
          .eq("id", r.id)
          .eq("created_by", input.userId);
      } else {
        await admin
          .from("custom_sections")
          .update({ name: r.to.slice(0, 60) })
          .eq("id", r.id)
          .eq("created_by", input.userId);
      }
    }

    // 4. Soft-deletes (owner-scoped). Items stay intact for the 24h undo.
    for (const d of patch.deletes) {
      const table = d.kind === "org" ? "organizations" : "custom_sections";
      await admin
        .from(table)
        .update({ deleted_at: now })
        .eq("id", d.id)
        .eq("created_by", input.userId);
    }

    await admin.from("onboarding_setup_plans").insert({
      user_id: input.userId,
      plan: { patch, created_org_ids: createdOrgIds },
      source: input.source,
    });

    await logAuditEvent({
      userId: input.userId,
      action: "setup_change_executed",
      resourceType: "setup_plan",
      metadata: {
        creates: patch.creates.length,
        section_adds: patch.section_adds.length,
        renames: patch.renames.length,
        deletes: patch.deletes.length,
      },
    });

    return { ok: true, primaryOrgId: createdOrgIds[0] };
  } catch (e) {
    for (const id of createdOrgIds) await admin.from("organizations").delete().eq("id", id);
    return { ok: false, error: (e as Error).message };
  }
}
