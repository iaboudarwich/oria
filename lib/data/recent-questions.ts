import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";

/**
 * The user's most repeated recent Ask / Work-agent questions, in the
 * active org. We dedupe case-insensitively and rank by repeat count,
 * tiebreak by recency. Used by the empty-state suggestion chips on
 * Ask Oria and the Work Analysis prompt so Oria offers each user the
 * questions they actually return to, not the same hardcoded list.
 *
 * Scoped to organization_id + actor_id so a Personal-space owner
 * doesn't see Work prompts bleed in (and vice versa).
 */
export async function listRecentUserQuestions(input: {
  /** "ask" for Ask Oria, "work" for the Work agent. */
  surface: "ask" | "work";
  limit?: number;
  /** Lookback window in days. */
  windowDays?: number;
}): Promise<string[]> {
  const ctx = await requireContext();
  const limit = input.limit ?? 3;
  const sinceISO = new Date(
    Date.now() - (input.windowDays ?? 60) * 24 * 3600 * 1000,
  ).toISOString();

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("learning_events")
      .select("payload, created_at")
      .eq("organization_id", ctx.organization.id)
      .eq("actor_id", ctx.profile.id)
      .eq("kind", "search.queried")
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: false })
      .limit(200);

    type Row = {
      payload: { q?: string; via?: string };
      created_at: string;
    };

    // Rank: case-insensitive count; tiebreak by most-recent.
    const counts = new Map<
      string,
      { display: string; count: number; lastAt: string }
    >();
    for (const r of (data ?? []) as Row[]) {
      const q = r.payload?.q;
      const via = r.payload?.via;
      if (typeof q !== "string") continue;
      const text = q.trim();
      if (text.length < 6) continue;

      const viaStr = typeof via === "string" ? via : "";
      const isWork = viaStr.startsWith("work");
      if (input.surface === "work" && !isWork) continue;
      if (input.surface === "ask" && isWork) continue;

      const key = text.toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
        if (r.created_at > existing.lastAt) existing.lastAt = r.created_at;
      } else {
        counts.set(key, { display: text, count: 1, lastAt: r.created_at });
      }
    }

    return Array.from(counts.values())
      .filter((v) => v.count >= 2)
      .sort((a, b) =>
        b.count !== a.count
          ? b.count - a.count
          : b.lastAt.localeCompare(a.lastAt),
      )
      .slice(0, limit)
      .map((v) => v.display);
  } catch {
    return [];
  }
}
