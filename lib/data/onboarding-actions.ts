"use server";

import { markHintSeen, type HintKey } from "./onboarding";
import { revalidatePath } from "next/cache";

/**
 * Server action: dismiss a hint for the current user.
 * Called from the Hint client component via a form action.
 */
export async function dismissHint(hintKey: HintKey): Promise<void> {
  await markHintSeen(hintKey);
  revalidatePath("/dashboard", "layout");
}
