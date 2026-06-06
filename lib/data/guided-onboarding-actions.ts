"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Dismiss the dashboard reprompt banner that nudges users to tell Oria about
 * their life. The banner itself now routes into the Round-7 onboarding flow
 * (/onboarding/demo); this action only records the dismissal preference.
 */
export async function dismissReprompt(duration: "7d" | "permanent"): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (duration === "permanent") {
    await supabase
      .from("profiles")
      .update({ onboarding_reprompt_permanent_dismiss: true })
      .eq("id", user.id);
  } else {
    const until = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await supabase
      .from("profiles")
      .update({ onboarding_reprompt_dismissed_until: until })
      .eq("id", user.id);
  }
  revalidatePath("/dashboard", "layout");
}
