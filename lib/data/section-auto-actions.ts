"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

/**
 * Accept the auto-suggested section for a single upload.
 * Applies auto_section/auto_custom_section_id to the live section fields
 * and sets section_assigned_by = 'user' (user confirmed Oria's choice).
 */
export async function acceptSectionSuggestion(uploadId: string): Promise<void> {
  const supabase = await createClient();
  const { data: upload } = await supabase
    .from("uploads")
    .select("auto_section, auto_custom_section_id")
    .eq("id", uploadId)
    .maybeSingle();
  if (!upload) return;

  const row = upload as { auto_section?: string | null; auto_custom_section_id?: string | null };
  if (!row.auto_section && !row.auto_custom_section_id) return;

  await supabase
    .from("uploads")
    .update({
      ...(row.auto_section ? { section: row.auto_section } : {}),
      ...(row.auto_custom_section_id ? { custom_section_id: row.auto_custom_section_id } : {}),
      section_assigned_by: "user",
    })
    .eq("id", uploadId);

  revalidatePath("/dashboard/inbox");
  revalidatePath(`/dashboard/uploads/${uploadId}`);
}

/**
 * Accept ALL pending auto-suggestions in the current user's active org.
 * Runs via admin client for a batch update.
 */
export async function acceptAllSectionSuggestions(): Promise<{ accepted: number }> {
  const supabase = await createClient();
  const admin = createAdminClient();

  // Get the user's active org from context.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { accepted: 0 };

  // Find uploads with suggestions but no current section.
  const { data: uploads } = await supabase
    .from("uploads")
    .select("id, auto_section, auto_custom_section_id")
    .is("section", null)
    .is("custom_section_id", null)
    .not("auto_section", "is", null);

  if (!uploads?.length) return { accepted: 0 };

  let accepted = 0;
  for (const u of uploads as Array<{
    id: string;
    auto_section: string | null;
    auto_custom_section_id: string | null;
  }>) {
    if (!u.auto_section && !u.auto_custom_section_id) continue;
    await admin
      .from("uploads")
      .update({
        ...(u.auto_section ? { section: u.auto_section } : {}),
        ...(u.auto_custom_section_id ? { custom_section_id: u.auto_custom_section_id } : {}),
        section_assigned_by: "user",
      })
      .eq("id", u.id);
    accepted++;
  }

  revalidatePath("/dashboard/inbox");
  return { accepted };
}

/**
 * Mark an upload's section as user-assigned (called when user manually
 * changes the section, overriding Oria's auto-filing).
 */
export async function markSectionUserAssigned(uploadId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("uploads").update({ section_assigned_by: "user" }).eq("id", uploadId);
  revalidatePath(`/dashboard/uploads/${uploadId}`);
}
