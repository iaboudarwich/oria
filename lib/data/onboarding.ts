import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * The four one-time onboarding hints we show new users.
 * Value is the stable DB key; don't rename without a migration.
 */
export type HintKey =
  | "first_upload"
  | "try_ask_oria"
  | "create_circle"
  | "take_photo_mobile"
  | "feature_tour";

export const ALL_HINT_KEYS: HintKey[] = [
  "first_upload",
  "try_ask_oria",
  "create_circle",
  "take_photo_mobile",
  "feature_tour",
];

/**
 * Return the set of hint keys already dismissed by the current user.
 * Best-effort. returns empty set on any error so hints remain hidden
 * rather than looping forever on a DB problem.
 */
export async function getSeenHintKeys(): Promise<Set<HintKey>> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("user_onboarding")
      .select("hint_key");
    return new Set(((data ?? []) as { hint_key: string }[]).map((r) => r.hint_key as HintKey));
  } catch {
    return new Set();
  }
}

/**
 * Mark a hint as dismissed for the current user. Idempotent (upsert).
 * Called from the dismissHint server action.
 */
export async function markHintSeen(hintKey: HintKey): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("user_onboarding").upsert(
      { user_id: user.id, hint_key: hintKey },
      { onConflict: "user_id,hint_key" }
    );
  } catch {
    // Best-effort
  }
}
