"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { recordLearningEvent } from "./learning";
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
 *   item_id      — uuid of the memory_items row
 *   target_kind  — "builtin" | "custom" | "review"
 *   target_key   — Section enum, custom_section uuid, or "review"
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
      "id, organization_id, section, custom_section_id, upload_id, uploads(uploaded_by)",
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
    uploads: { uploaded_by: string | null }[] | { uploaded_by: string | null } | null;
  };
  const uploader = Array.isArray(row.uploads)
    ? row.uploads[0]?.uploaded_by ?? null
    : row.uploads?.uploaded_by ?? null;

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

  if (row.upload_id) revalidatePath(`/dashboard/uploads/${row.upload_id}`);
  revalidatePath("/dashboard");
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
