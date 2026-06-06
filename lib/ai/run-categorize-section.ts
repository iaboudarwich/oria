import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { inferSection } from "@/lib/ai/categorize-section";
import { recordSystemEvent } from "@/lib/data/system-events";

/** Confidence threshold: above this, auto-file the upload. Below, suggest only. */
const HIGH_CONFIDENCE = 0.7;

/**
 * Run section auto-categorization for one upload.
 *
 * High confidence (> 0.7): set uploads.section/custom_section_id directly
 *   and mark section_assigned_by = 'auto'.
 * Low confidence: store in auto_section/auto_custom_section_id only.
 *
 * Idempotent: skips uploads that already have a user-assigned section.
 */
export async function runCategorizeSection(uploadId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: upload } = await admin
    .from("uploads")
    .select("id, organization_id, section, custom_section_id, section_assigned_by, status")
    .eq("id", uploadId)
    .maybeSingle();

  if (!upload) return;
  if (upload.status !== "filed") return;

  // Don't overwrite user's own section choice.
  const assignedBy = ((upload as Record<string, unknown>).section_assigned_by as string) ?? "user";
  const hasSection = !!(upload.section || upload.custom_section_id);
  if (hasSection && assignedBy === "user") return;

  const result = await inferSection(uploadId);

  const orgId = upload.organization_id as string;

  const hasTarget = !!(result.section || result.customSectionId);
  const decision = !hasTarget
    ? "none"
    : result.confidence > HIGH_CONFIDENCE
      ? "auto-filed"
      : "suggested";

  // Log EVERY auto-categorization decision with its confidence + the
  // threshold + the resulting decision, so the 0.7 cutoff can be tuned from
  // real data later.
  void recordSystemEvent({
    kind: "upload.processed",
    severity: "info",
    message: `Auto-section inference: ${result.section ?? result.customSectionId ?? "none"} (${Math.round(result.confidence * 100)}%, ${decision})`,
    context: {
      uploadId,
      section: result.section,
      customSectionId: result.customSectionId,
      confidence: result.confidence,
      threshold: HIGH_CONFIDENCE,
      decision,
      reasoning: result.reasoning,
    },
    organizationId: orgId,
  });

  if (result.confidence > HIGH_CONFIDENCE) {
    // High confidence: apply the section directly.
    await admin
      .from("uploads")
      .update({
        ...(result.section ? { section: result.section } : {}),
        ...(result.customSectionId ? { custom_section_id: result.customSectionId } : {}),
        section_assigned_by: "auto",
        auto_section: result.section,
        auto_custom_section_id: result.customSectionId,
      })
      .eq("id", uploadId);
  } else if (result.section || result.customSectionId) {
    // Low confidence: store as suggestion only.
    await admin
      .from("uploads")
      .update({
        auto_section: result.section,
        auto_custom_section_id: result.customSectionId,
      })
      .eq("id", uploadId);
  }
}
