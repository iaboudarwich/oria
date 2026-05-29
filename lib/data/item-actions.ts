"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { recordLearningEvent } from "./learning";
import { enrichBuiltinSectionFromMove } from "./section-context";
import { sortItemsWithInstruction } from "@/lib/ai/sort-items";
import type { Section } from "@/lib/supabase/types";

const BUILTIN_SECTIONS = new Set<Section>([
  "household",
  "travel",
  "properties",
  "staff",
  "events",
  "finance",
  "legal",
  "personal",
  "vendors",
  "health",
]);

type ResolvedTarget =
  | { kind: "builtin"; section: Section }
  | { kind: "custom"; custom_section_id: string }
  | { kind: "unsorted" };

function resolveTarget(kind: string, key: string): ResolvedTarget | null {
  if (kind === "builtin" && BUILTIN_SECTIONS.has(key as Section)) {
    return { kind: "builtin", section: key as Section };
  }
  if (kind === "custom" && key) {
    return { kind: "custom", custom_section_id: key };
  }
  if (kind === "review" || kind === "unsorted") return { kind: "unsorted" };
  return null;
}

function patchForTarget(t: ResolvedTarget) {
  if (t.kind === "builtin")
    return { section: t.section, custom_section_id: null };
  if (t.kind === "custom")
    return { section: null, custom_section_id: t.custom_section_id };
  return { section: null, custom_section_id: null };
}

/**
 * Move a single detected memory_item to a section. Owner or the original
 * uploader can do this; RLS does the rest.
 *
 * FormData:
 *   item_id     . uuid of the memory_items row
 *   target_kind . "builtin" | "custom" | "review"
 *   target_key  . Section enum, custom_section uuid, or "review"
 */
export async function setItemSection(formData: FormData): Promise<void> {
  const id = String(formData.get("item_id") ?? "").trim();
  const kind = String(formData.get("target_kind") ?? "").trim();
  const key = String(formData.get("target_key") ?? "").trim();
  if (!id || !kind) return;

  const target = resolveTarget(kind, key);
  if (!target) return;

  const ctx = await requireContext();
  const supabase = await createClient();

  // Verify the item is in the active org and grab the parent upload's
  // uploader for the owner-or-uploader gate.
  const cur = await supabase
    .from("memory_items")
    .select(
      "id, organization_id, section, custom_section_id, upload_id, title, merchant, uploads(uploaded_by, filename)",
    )
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!cur.data) return;

  const row = cur.data as {
    id: string;
    section: Section | null;
    custom_section_id: string | null;
    upload_id: string | null;
    title: string | null;
    merchant: string | null;
    uploads:
      | { uploaded_by: string | null; filename: string | null }[]
      | { uploaded_by: string | null; filename: string | null }
      | null;
  };
  const uploadJoin = Array.isArray(row.uploads)
    ? row.uploads[0] ?? null
    : row.uploads ?? null;
  const uploader = uploadJoin?.uploaded_by ?? null;
  const parentFilename = uploadJoin?.filename ?? null;

  const isOwner = ctx.membership.role === "owner";
  const isUploader = uploader === ctx.profile.id;
  if (!isOwner && !isUploader) return;

  await supabase
    .from("memory_items")
    .update(patchForTarget(target))
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);

  void recordLearningEvent({
    organizationId: ctx.organization.id,
    actorId: ctx.profile.id,
    kind: "upload.moved",
    payload: {
      item_id: id,
      upload_id: row.upload_id,
      from: { section: row.section, custom_section_id: row.custom_section_id },
      to: patchForTarget(target),
      via: "item",
    },
  });

  // Close the learning loop for item-level moves out of Unsorted, same
  // policy as setUploadSection. Per-org by construction (we pass
  // ctx.organization.id) so a move in one Workspace never enriches
  // another space's classifier.
  const wasUnsorted = row.section === null && row.custom_section_id === null;
  if (wasUnsorted && target.kind === "builtin") {
    const sourceText = [row.title, row.merchant, parentFilename]
      .filter((s): s is string => !!s)
      .join(" ");
    if (sourceText) {
      void enrichBuiltinSectionFromMove({
        organizationId: ctx.organization.id,
        section: target.section,
        sourceText,
      });
    }
  }

  // Propagate up to the parent upload: once every item of a multi-item
  // upload has a section, the source file should leave Unsorted. If all
  // items landed in the same section, mirror it onto the upload so the
  // section page shows one entry, not many; otherwise stamp
  // metadata.items_sorted_at so the Unsorted listing skips it (the
  // source still lives in /dashboard/inbox. the Uploads archive).
  if (row.upload_id) {
    await propagateUploadSectionFromItems(row.upload_id, ctx.organization.id);
    revalidatePath(`/dashboard/uploads/${row.upload_id}`);
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/sections/review");
}

/**
 * Re-derive a multi-item upload's section from its current items.
 *
 *   • Some items still in Unsorted → no-op. The upload stays where it is.
 *   • All items share one built-in section → upload.section = that section.
 *   • All items share one custom section → upload.custom_section_id = that.
 *   • Items span multiple sections → leave section/custom_section_id null
 *     but stamp metadata.items_sorted_at so Unsorted excludes it.
 *
 * Per-org by construction (caller passes the active org id; the update
 * is filtered on it too). Best-effort: any failure leaves the row
 * unchanged rather than half-updated.
 */
async function propagateUploadSectionFromItems(
  uploadId: string,
  organizationId: string,
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: itemRows } = await supabase
      .from("memory_items")
      .select("section, custom_section_id")
      .eq("upload_id", uploadId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null);

    type ItemSlim = {
      section: Section | null;
      custom_section_id: string | null;
    };
    const items = (itemRows ?? []) as ItemSlim[];
    if (items.length === 0) return; // nothing to propagate from

    const anyUnsorted = items.some(
      (i) => i.section === null && i.custom_section_id === null,
    );
    if (anyUnsorted) return; // still has work pending

    const builtins = new Set(items.map((i) => i.section).filter((s): s is Section => !!s));
    const customs = new Set(
      items.map((i) => i.custom_section_id).filter((s): s is string => !!s),
    );

    const { data: uploadRow } = await supabase
      .from("uploads")
      .select("section, custom_section_id, metadata")
      .eq("id", uploadId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!uploadRow) return;
    const current = uploadRow as {
      section: Section | null;
      custom_section_id: string | null;
      metadata: Record<string, unknown> | null;
    };

    const nowIso = new Date().toISOString();
    let patch: {
      section?: Section | null;
      custom_section_id?: string | null;
      metadata?: Record<string, unknown>;
    } | null = null;

    if (builtins.size === 1 && customs.size === 0) {
      const only = Array.from(builtins)[0];
      if (current.section !== only || current.custom_section_id !== null) {
        patch = { section: only, custom_section_id: null };
      }
    } else if (customs.size === 1 && builtins.size === 0) {
      const only = Array.from(customs)[0];
      if (current.custom_section_id !== only || current.section !== null) {
        patch = { section: null, custom_section_id: only };
      }
    } else {
      // Items span multiple destinations. Leave the upload sectionless
      // but stamp metadata so Unsorted excludes it. The source still
      // appears in /dashboard/inbox (the per-space Uploads archive).
      const md = current.metadata ?? {};
      if (!("items_sorted_at" in md)) {
        patch = { metadata: { ...md, items_sorted_at: nowIso } };
      }
    }

    if (patch) {
      await supabase
        .from("uploads")
        .update(patch)
        .eq("id", uploadId)
        .eq("organization_id", organizationId);
    }
  } catch {
    // Best-effort: never block the move.
  }
}

/**
 * Move many items in one call. FormData encodes one entry per item:
 *   item_id[i], target_kind[i], target_key[i]   (parallel arrays via getAll)
 */
export async function batchSetItemSections(formData: FormData): Promise<void> {
  const ids = formData.getAll("item_id").map(String);
  const kinds = formData.getAll("target_kind").map(String);
  const keys = formData.getAll("target_key").map(String);
  if (ids.length === 0 || ids.length !== kinds.length || ids.length !== keys.length) {
    return;
  }
  // Just run them in order; the batches are small (typically 2..8 receipts).
  for (let i = 0; i < ids.length; i++) {
    const fd = new FormData();
    fd.set("item_id", ids[i]);
    fd.set("target_kind", kinds[i]);
    fd.set("target_key", keys[i]);
    await setItemSection(fd);
  }
}

export type NLApplyResult =
  | { ok: true; applied: Array<{ title: string; target: string }> }
  | { ok: false; error: string };

/**
 * Take a free-form sentence from the user ("Put Hermès in Expenses, Spinneys
 * in Groceries") and apply it to the items of a single upload. Resolution
 * runs through Claude using tool-use so the model returns a clean mapping
 * we then apply via setItemSection.
 */
export async function applyItemSortingInstruction(
  formData: FormData,
): Promise<NLApplyResult> {
  const uploadId = String(formData.get("upload_id") ?? "").trim();
  const instruction = String(formData.get("instruction") ?? "").trim();
  if (!uploadId || !instruction) {
    return { ok: false, error: "Missing upload or instruction" };
  }

  const ctx = await requireContext();
  const supabase = await createClient();

  // Items on this upload, scoped to the active org.
  const itemsRes = await supabase
    .from("memory_items")
    .select("id, title, merchant, category, section, custom_section_id")
    .eq("upload_id", uploadId)
    .eq("organization_id", ctx.organization.id)
    .is("deleted_at", null);
  const items =
    (itemsRes.data ?? []) as Array<{
      id: string;
      title: string;
      merchant: string | null;
      category: string | null;
      section: Section | null;
      custom_section_id: string | null;
    }>;
  if (items.length === 0) return { ok: false, error: "No items to sort" };

  // Sections available in this org (builtin labels + custom names).
  const customRes = await supabase
    .from("custom_sections")
    .select("id, name")
    .eq("organization_id", ctx.organization.id);
  const customs = (customRes.data ?? []) as Array<{ id: string; name: string }>;

  const decisions = await sortItemsWithInstruction({
    instruction,
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      merchant: i.merchant,
      category: i.category,
    })),
    customSections: customs,
  });
  if (!decisions) {
    return { ok: false, error: "Could not parse your instruction" };
  }

  const applied: Array<{ title: string; target: string }> = [];
  for (const d of decisions) {
    const item = items.find((i) => i.id === d.item_id);
    if (!item) continue;
    const target = resolveTarget(d.target_kind, d.target_key);
    if (!target) continue;
    const fd = new FormData();
    fd.set("item_id", item.id);
    fd.set("target_kind", d.target_kind);
    fd.set("target_key", d.target_key);
    await setItemSection(fd);
    applied.push({
      title: item.merchant || item.title,
      target:
        target.kind === "builtin"
          ? target.section
          : target.kind === "custom"
            ? customs.find((c) => c.id === target.custom_section_id)?.name ??
              "Custom"
            : "Unsorted",
    });
  }

  if (applied.length === 0) {
    return { ok: false, error: "No matches I'm confident about." };
  }
  return { ok: true, applied };
}
