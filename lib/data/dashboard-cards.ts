import "server-only";

import { createClient } from "@/lib/supabase/server";
import { parseCardPrefs, type CardPref } from "@/lib/daily/stat-cards";

/** The user's saved Today daily-stats layout (order + hidden), RLS-scoped. */
export async function getDashboardCardPrefs(userId: string): Promise<CardPref[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_preferences")
    .select("dashboard_cards")
    .eq("user_id", userId)
    .maybeSingle();
  return parseCardPrefs((data as { dashboard_cards?: unknown } | null)?.dashboard_cards);
}
