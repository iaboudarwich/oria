"use server";

import { createClient } from "@/lib/supabase/server";
import { clearPendingAiNotice } from "./ai-connections";

/** Dismiss the one-time AI fallback notice after the toast is shown. */
export async function dismissAiNotice(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await clearPendingAiNotice(user.id);
}
