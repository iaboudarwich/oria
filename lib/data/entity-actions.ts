"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireContext } from "./organizations";
import { suggestEntityTypeSchema } from "@/lib/ai/suggest-entity-schema";
import type { FieldDef } from "./entities";

/** Returns AI-suggested field schema for a new entity type. */
export async function suggestSchemaAction(
  name: string,
  description: string,
): Promise<FieldDef[]> {
  return suggestEntityTypeSchema(name, description);
}

/** Create a new entity type. */
export async function createEntityType(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const supabase = await createClient();

  const label_singular = String(formData.get("label_singular") ?? "").trim();
  const label_plural = String(formData.get("label_plural") ?? "").trim();
  const key = label_singular
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const icon = String(formData.get("icon") ?? "").trim() || null;
  const rawSchema = String(formData.get("field_schema") ?? "[]");

  let field_schema: FieldDef[] = [];
  try {
    field_schema = JSON.parse(rawSchema) as FieldDef[];
  } catch {
    field_schema = [];
  }

  if (!label_singular || !label_plural) return;

  await supabase.from("entity_types").insert({
    organization_id: ctx.organization.id,
    key,
    label_singular,
    label_plural,
    icon,
    field_schema,
    created_by: ctx.profile.id,
  });

  revalidatePath("/dashboard/things");
  redirect("/dashboard/things");
}

/** Create a new entity. */
export async function createEntity(formData: FormData): Promise<void> {
  const ctx = await requireContext();
  const supabase = await createClient();

  const entity_type_id = String(formData.get("entity_type_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!entity_type_id || !name) return;

  const details: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("field_") && String(v).trim()) {
      details[k.slice("field_".length)] = String(v).trim();
    }
  }

  const { data } = await supabase
    .from("entities")
    .insert({
      organization_id: ctx.organization.id,
      entity_type_id,
      name,
      details,
      created_by: ctx.profile.id,
    })
    .select("id")
    .single();

  if (data) redirect(`/dashboard/things/${(data as { id: string }).id}`);
}

/** Link an upload to an entity. */
export async function linkUploadToEntity(
  entityId: string,
  uploadId: string,
  relationship: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("entity_uploads").upsert(
    { entity_id: entityId, upload_id: uploadId, relationship },
    { onConflict: "entity_id,upload_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/dashboard/things/${entityId}`);
  revalidatePath(`/dashboard/uploads/${uploadId}`);
  return { ok: true };
}

/** Set an entity's primary photo. */
export async function setPrimaryPhoto(
  entityId: string,
  uploadId: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("entities")
    .update({ primary_photo_upload_id: uploadId })
    .eq("id", entityId);
  revalidatePath(`/dashboard/things/${entityId}`);
}

/**
 * Save user-edited fields for an extracted entity (from the upload detail
 * page panel) and mark it verified. This replaces the function that was
 * previously in this file.
 */
export async function saveEntityEdits(
  uploadId: string,
  editedFields: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("extracted_entities")
      .update({
        user_edited_fields: editedFields,
        user_verified: true,
      })
      .eq("upload_id", uploadId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dashboard/uploads/${uploadId}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

/** Seed entity types for a given org (called from applyTemplate). */
export async function seedEntityTypes(
  organizationId: string,
  types: Array<{
    key: string;
    label_singular: string;
    label_plural: string;
    icon?: string;
    field_schema: FieldDef[];
  }>,
): Promise<void> {
  const admin = createAdminClient();
  for (const t of types) {
    await admin
      .from("entity_types")
      .upsert(
        {
          organization_id: organizationId,
          key: t.key,
          label_singular: t.label_singular,
          label_plural: t.label_plural,
          icon: t.icon ?? null,
          field_schema: t.field_schema,
          is_seeded: true,
          created_by: null,
        },
        { onConflict: "organization_id,key" },
      );
  }
}

/**
 * Translate the displayed extracted entity fields to the user's account
 * language. Only updates the UI display — the stored fields remain in
 * their original language.
 *
 * Returns the translated fields object.
 */
export async function translateUploadFieldsAction(
  uploadId: string,
  targetLanguage: string,
): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  const { data: entity } = await supabase
    .from("extracted_entities")
    .select("doc_type, fields")
    .eq("upload_id", uploadId)
    .maybeSingle();
  if (!entity) return null;

  // Import dynamically to avoid server-only in non-server context
  const { getAnthropic, getModel } = await import("@/lib/ai/anthropic");
  const anthropic = getAnthropic();
  if (!anthropic) return null;

  const langNames: Record<string, string> = {
    en: "English", ar: "Arabic", fr: "French", es: "Spanish",
  };
  const targetName = langNames[targetLanguage] ?? targetLanguage;

  const fieldsStr = JSON.stringify(entity.fields, null, 2);
  try {
    const msg = await anthropic.messages.create({
      model: getModel(),
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `Translate the string values in this JSON object to ${targetName}. Keep all keys in English. Return ONLY the translated JSON, no explanation.\n\n${fieldsStr}`,
      }],
    });
    const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
}
