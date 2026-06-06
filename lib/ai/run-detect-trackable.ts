import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { detectTrackable, TRACKABLE_LEAD_DAYS } from "@/lib/ai/detect-trackable";
import { createTrackableFromDetection } from "@/lib/data/trackables";
import type { TrackableCategory } from "@/lib/ai/detect-trackable";

/**
 * Run trackable detection for an upload after extraction completes.
 * Creates a trackables row when the document has a renewal/expiry date.
 * Also enqueues a reminder suggestion via the existing suggestion flow.
 *
 * Idempotent: skips if a trackable for this upload already exists.
 */
export async function runDetectTrackable(uploadId: string): Promise<void> {
  const admin = createAdminClient();

  // Skip if already tracked
  const { data: existing } = await admin
    .from("trackables")
    .select("id")
    .eq("source_upload_id", uploadId)
    .maybeSingle();
  if (existing) return;

  // Fetch upload + extracted entity
  const { data: upload } = await admin
    .from("uploads")
    .select("id, organization_id, uploaded_by, status, mime_type")
    .eq("id", uploadId)
    .maybeSingle();
  if (!upload || upload.status !== "filed") return;

  // Skip images (no text to analyze)
  const mime = String(upload.mime_type ?? "");
  if (mime.startsWith("image/")) return;

  const { data: entity } = await admin
    .from("extracted_entities")
    .select("doc_type, fields")
    .eq("upload_id", uploadId)
    .maybeSingle();
  if (!entity) return;

  // Get text from document chunks for context
  const { data: chunks } = await admin
    .from("document_chunks")
    .select("content")
    .eq("upload_id", uploadId)
    .order("chunk_index", { ascending: true })
    .limit(10);
  const textPreview = (chunks ?? [])
    .map((c: { content: string }) => c.content)
    .join("\n\n")
    .slice(0, 2000);

  const result = await detectTrackable(
    textPreview,
    entity.doc_type as string,
    entity.fields as Record<string, unknown>,
  );

  if (!result.is_trackable || !result.category) return;

  const trackableId = await createTrackableFromDetection({
    organizationId: upload.organization_id as string,
    uploadId,
    createdBy: upload.uploaded_by as string,
    category: result.category as TrackableCategory,
    title: result.title ?? entity.doc_type,
    vendor: result.vendor,
    starts_at: result.starts_at,
    ends_at: result.ends_at,
    renewal_date: result.renewal_date,
    cost_amount: result.cost_amount,
    cost_currency: result.cost_currency,
    cost_period: result.cost_period,
    summary: result.summary,
  });

  if (!trackableId) return;

  // Auto-create reminder suggestion if renewal_date is set and in the future
  if (result.renewal_date) {
    const renewalMs = new Date(result.renewal_date).getTime();
    if (renewalMs > Date.now()) {
      const leadDays = TRACKABLE_LEAD_DAYS[result.category as TrackableCategory] ?? 30;
      const reminderTitle = `${result.title ?? result.category} renews${
        result.vendor ? ` (${result.vendor})` : ""
      }`;

      // Insert into reminders via suggestion flow: create a reminder with
      // source_upload_id so it shows up in SuggestedRemindersPanel.
      // We write it directly as auto_suggested=true; user confirms in UI.
      await admin.from("reminders").insert({
        organization_id: upload.organization_id,
        title: reminderTitle,
        due_at: result.renewal_date,
        lead_days: leadDays,
        source_upload_id: uploadId,
        auto_suggested: true,
        created_by: upload.uploaded_by,
        done: false,
      });
    }
  }
}
