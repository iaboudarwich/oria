import "server-only";

import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type { SectionScope } from "./section-scope";

/**
 * The user's most repeated recent Ask / Work-agent questions, in the
 * active org. We dedupe case-insensitively and rank by repeat count,
 * tiebreak by recency. Used by the empty-state suggestion chips on
 * Ask Oria and the Work Analysis prompt so Oria offers each user the
 * questions they actually return to, not the same hardcoded list.
 *
 * Scoped to organization_id + actor_id so a Personal-space owner
 * doesn't see Work prompts bleed in (and vice versa).
 *
 * When `scope` is supplied, only questions that were originally asked
 * inside that exact section scope are returned. The Ask Oria API
 * tags learning events with `via: "ask:builtin:finance"` etc., so we
 * match against that tag. a Diet question never shows up as a
 * recent Bills suggestion and vice versa.
 */
export async function listRecentUserQuestions(input: {
  /** "ask" for Ask Oria, "work" for the Work agent. */
  surface: "ask" | "work";
  limit?: number;
  /** Lookback window in days. */
  windowDays?: number;
  /** Restrict to questions asked inside a specific section scope. */
  scope?: SectionScope | null;
}): Promise<string[]> {
  const ctx = await requireContext();
  const limit = input.limit ?? 3;
  const sinceISO = new Date(Date.now() - (input.windowDays ?? 60) * 24 * 3600 * 1000).toISOString();

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
    const counts = new Map<string, { display: string; count: number; lastAt: string }>();
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

      // Section-scope match. The Ask API records `via` as either
      // "ask" (no scope) or `ask:<kind>:<key>`. so we filter on the
      // exact compound tag when the caller supplied a scope.
      if (input.scope) {
        const wantTag = `ask:${input.scope.kind}:${input.scope.key}`;
        if (viaStr !== wantTag) continue;
      } else if (input.surface === "ask") {
        // The general /dashboard/ask page should NOT surface
        // section-scoped recents. those belong to their section.
        if (viaStr.startsWith("ask:")) continue;
      }

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
      .sort((a, b) => (b.count !== a.count ? b.count - a.count : b.lastAt.localeCompare(a.lastAt)))
      .slice(0, limit)
      .map((v) => v.display);
  } catch {
    return [];
  }
}
