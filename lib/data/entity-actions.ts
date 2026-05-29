"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Save user-edited fields for an extracted entity and mark it verified.
 * The upload must belong to the current user (RLS ee_write enforces this).
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
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
