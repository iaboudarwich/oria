import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";

export type FieldType =
  | "text" | "number" | "date" | "currency"
  | "enum" | "boolean" | "long_text";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[]; // for enum
};

export type EntityType = {
  id: string;
  organization_id: string;
  key: string;
  label_singular: string;
  label_plural: string;
  icon: string | null;
  field_schema: FieldDef[];
  relationship_options: string[];
  is_seeded: boolean;
  created_by: string | null;
  created_at: string;
  archived_at: string | null;
};

export type Entity = {
  id: string;
  organization_id: string;
  entity_type_id: string;
  name: string;
  details: Record<string, unknown>;
  primary_photo_upload_id: string | null;
  created_by: string;
  created_at: string;
  archived_at: string | null;
};

export type EntityUpload = {
  entity_id: string;
  upload_id: string;
  relationship: string;
  added_at: string;
};

// ── Entity types ─────────────────────────────────────────────────────────────

export async function listEntityTypes(): Promise<EntityType[]> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("entity_types")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  return (data ?? []) as EntityType[];
}

export async function getEntityType(id: string): Promise<EntityType | null> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("entity_types")
    .select("*")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .maybeSingle();
  return (data as EntityType | null);
}

// ── Entities ──────────────────────────────────────────────────────────────────

export async function listEntities(entityTypeId: string): Promise<Entity[]> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("entities")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .eq("entity_type_id", entityTypeId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as Entity[];
}

export async function getEntity(id: string): Promise<Entity | null> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("entities")
    .select("*")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .maybeSingle();
  return (data as Entity | null);
}

export async function countEntitiesByType(
  orgId: string,
): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entities")
    .select("entity_type_id")
    .eq("organization_id", orgId)
    .is("archived_at", null);
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { entity_type_id: string }[]) {
    counts[row.entity_type_id] = (counts[row.entity_type_id] ?? 0) + 1;
  }
  return counts;
}

// ── Entity uploads ─────────────────────────────────────────────────────────

export async function listEntityUploads(
  entityId: string,
  relationship?: string,
): Promise<EntityUpload[]> {
  const supabase = await createClient();
  let q = supabase
    .from("entity_uploads")
    .select("*")
    .eq("entity_id", entityId)
    .order("added_at", { ascending: false });
  if (relationship) q = q.eq("relationship", relationship);
  const { data } = await q;
  return (data ?? []) as EntityUpload[];
}

export async function getUploadEntities(
  uploadId: string,
): Promise<Array<EntityUpload & { entity: Entity; entity_type: EntityType }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entity_uploads")
    .select("*, entities(*, entity_types(*))")
    .eq("upload_id", uploadId);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const entities = r.entities as Record<string, unknown>;
    const entity_types = entities?.entity_types as EntityType;
    return {
      ...(r as unknown as EntityUpload),
      entity: entities as unknown as Entity,
      entity_type: entity_types,
    };
  });
}
