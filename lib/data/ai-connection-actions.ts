"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { clearPendingAiNotice, setReasoningMode, type ReasoningMode } from "./ai-connections";

/** Dismiss the one-time AI fallback notice after the toast is shown. */
export async function dismissAiNotice(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await clearPendingAiNotice(user.id);
}

/** Save the user's Ask Oria reasoning preference. */
export async function updateReasoningMode(mode: ReasoningMode): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await setReasoningMode(user.id, mode);
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/ask");
}
