import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "./audit-log";
import { createJob } from "./jobs";
import { extractImageGroup, type GroupRecord } from "@/lib/ai/extract-group";

/** Max images sent to the model in one group call (cost cap). Overflow images
 *  are re-queued for individual extraction so nothing is lost. */
const GROUP_IMAGE_CAP = 9;

type Member = {
  id: string;
  filename: string;
  mime_type: string | null;
  storage_path: string;
  metadata: Record<string, unknown> | null;
};

/**
 * Read a whole upload group as one set: one multimodal call decides whether the
 * images are one logical thing or several, and we write the resulting record(s)
 * tagged with the group. Idempotent via an atomic pending -> extracting claim,
 * so the client trigger and the cron fallback never double-extract.
 */
export async function extractUploadGroup(groupId: string): Promise<{ ok: boolean; status?: string }> {
  const admin = createAdminClient();

  // 1. Claim the group. Only the pending -> extracting transition proceeds.
  const { data: claimed } = await admin
    .from("upload_groups")
    .update({ status: "extracting" })
    .eq("id", groupId)
    .eq("status", "pending")
    .select("id, organization_id, created_by")
    .maybeSingle();
  if (!claimed) return { ok: false }; // already claimed, or not pending
  const orgId = (claimed as { organization_id: string }).organization_id;
  const actorId = (claimed as { created_by: string | null }).created_by;

  // 2. Member uploads (images), in drop order.
  const { data: rows } = await admin
    .from("uploads")
    .select("id, filename, mime_type, storage_path, metadata")
    .eq("group_id", groupId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const members = ((rows ?? []) as Member[]).filter((m) => (m.mime_type ?? "").startsWith("image/"));

  if (members.length === 0) {
    await admin.from("upload_groups").update({ status: "split" }).eq("id", groupId);
    return { ok: false, status: "empty" };
  }

  const capped = members.slice(0, GROUP_IMAGE_CAP);
  const overflow = members.slice(GROUP_IMAGE_CAP);

  // 3. Download the capped images.
  const images: { mimeType: string; dataBase64: string; filename: string }[] = [];
  const usable: Member[] = [];
  for (const m of capped) {
    const { data: blob } = await admin.storage.from("uploads").download(m.storage_path);
    if (!blob) continue;
    const buf = Buffer.from(await blob.arrayBuffer());
    images.push({ mimeType: m.mime_type ?? "image/jpeg", dataBase64: buf.toString("base64"), filename: m.filename });
    usable.push(m);
  }
  if (images.length === 0) {
    await requeueIndividually(members, groupId);
    await admin.from("upload_groups").update({ status: "split" }).eq("id", groupId);
    return { ok: false, status: "no_bytes" };
  }

  // 4. The one group call. Fall back to per-image extraction on failure.
  const result = await extractImageGroup(images);
  if (!result) {
    await requeueIndividually(members, groupId);
    await admin.from("upload_groups").update({ status: "split" }).eq("id", groupId);
    return { ok: false, status: "ai_unavailable" };
  }

  // 5. Write one record per returned record, attached to its primary image.
  const nowIso = new Date().toISOString();
  for (const rec of result.records) {
    const primary = usable[rec.image_indexes[0] ?? 0] ?? usable[0];
    const childIds = rec.image_indexes.slice(1).map((i) => usable[i]?.id).filter(Boolean) as string[];

    await admin.from("memory_items").insert({
      organization_id: orgId,
      upload_id: primary.id,
      group_id: groupId,
      document_type: rec.document_type,
      section: rec.section,
      smart_section: rec.smart_section,
      title: rec.title,
      summary: rec.summary,
      merchant: rec.merchant,
      amount_value: rec.amount_value,
      amount_currency: rec.amount_currency,
      occurred_at: rec.occurred_at,
      location: rec.location,
      confidence: rec.confidence,
      entities: {},
      facts: { source: "group", reason: result.reason, image_count: rec.image_indexes.length },
    });

    await admin.from("extracted_entities").upsert(
      {
        upload_id: primary.id,
        organization_id: orgId,
        group_id: groupId,
        doc_type: rec.document_type ?? "unknown",
        confidence: rec.confidence,
        fields: fieldsFor(rec),
        extracted_at: nowIso,
        extractor_version: "v1-group",
        user_verified: false,
        user_edited_fields: null,
      },
      { onConflict: "upload_id" },
    );

    // File the primary upload under the record's section; mark the children as
    // folded into the primary so the inbox shows the set as one.
    await admin
      .from("uploads")
      .update({ status: "filed", section: rec.section })
      .eq("id", primary.id);
    for (const cid of childIds) {
      const child = usable.find((m) => m.id === cid);
      await admin
        .from("uploads")
        .update({
          status: "filed",
          section: rec.section,
          metadata: { ...(child?.metadata ?? {}), grouped_child: true, grouped_into: primary.id },
        })
        .eq("id", cid);
    }
  }

  // 6. Overflow beyond the cap: re-queue each for individual extraction.
  if (overflow.length) await requeueIndividually(overflow, groupId);

  // 7. Mark the group + audit.
  const finalStatus = result.merged ? "merged" : "split";
  await admin.from("upload_groups").update({ status: finalStatus }).eq("id", groupId);
  if (actorId) {
    await logAuditEvent({
      userId: actorId,
      organizationId: orgId,
      action: "upload.group_extracted",
      resourceType: "upload_group",
      resourceId: groupId,
      metadata: { merged: result.merged, records: result.records.length, images: images.length, overflow: overflow.length },
    });
  }

  return { ok: true, status: finalStatus };
}

function fieldsFor(rec: GroupRecord): Record<string, unknown> {
  return {
    title: rec.title,
    summary: rec.summary,
    merchant: rec.merchant,
    amount: rec.amount_value,
    currency: rec.amount_currency,
    date: rec.occurred_at,
    location: rec.location,
  };
}

/** Detach uploads from a group and queue each for the normal per-file pass. */
async function requeueIndividually(members: Member[], groupId: string): Promise<void> {
  const admin = createAdminClient();
  for (const m of members) {
    await admin.from("uploads").update({ group_id: null }).eq("id", m.id);
    const { data: u } = await admin
      .from("uploads")
      .select("organization_id, uploaded_by")
      .eq("id", m.id)
      .maybeSingle();
    const org = (u as { organization_id?: string } | null)?.organization_id;
    if (org) {
      await createJob({
        organizationId: org,
        actorId: (u as { uploaded_by?: string | null } | null)?.uploaded_by ?? null,
        kind: "upload.extract",
        uploadId: m.id,
        context: { uploadId: m.id, from_group: groupId },
      });
    }
  }
}
