"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Accept a reminder suggestion. creates a reminder with lead_days,
 * source_upload_id, and auto_suggested=true.
 */
export async function acceptSuggestion(input: {
  uploadId: string;
  organizationId: string;
  title: string;
  targetDate: string;
  leadDays: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not signed in." };

    const { error } = await supabase.from("reminders").insert({
      title: input.title,
      due_at: input.targetDate,
      lead_days: input.leadDays,
      source_upload_id: input.uploadId,
      auto_suggested: true,
      created_by: user.id,
      upload_id: input.uploadId,
      organization_id: input.organizationId,
      done: false,
    });

    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dashboard/uploads/${input.uploadId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Dismiss a suggestion so it never re-appears for this user.
 */
export async function dismissSuggestion(
  suggestionKey: string,
): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("dismissed_suggestions")
      .upsert(
        { user_id: user.id, suggestion_key: suggestionKey },
        { onConflict: "user_id,suggestion_key" },
      );
  } catch {
    // Best-effort
  }
}
