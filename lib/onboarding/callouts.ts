/**
 * Build-animation callouts (Round 14.9 F2).
 *
 * Pure module so the "callouts name the user's ACTUAL answers" guarantee is
 * unit-testable. Each callout pairs a REAL section from the generated plan with
 * a REAL fragment from the conversation (a priority, a chaos area, a role), so
 * the animation can say "Adding a Lease section because you mentioned renting"
 * instead of generic phase copy. The component localizes the framing; the
 * section and reason are the user's own words (already in their language).
 */

import type { SetupPlan, UserContext } from "./types";

export type Callout = {
  /** A real section title from the plan. */
  section: string;
  /** A real fragment from the user's answers, or "" when nothing was captured. */
  reason: string;
};

const MAX_CALLOUTS = 3;

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    const key = t.toLowerCase();
    if (t && !seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

/**
 * Up to three callouts, each naming a real plan section and a real answer.
 * Sections are taken in plan (priority) order; reasons are drawn from the
 * answers most worth surfacing first (the week-one priority, then what felt
 * chaotic, then roles and life contexts). Returns fewer when the plan has fewer
 * sections; reason is "" only when the conversation captured nothing.
 */
export function buildCallouts(plan: SetupPlan, ctx: UserContext): Callout[] {
  const sections = uniqueNonEmpty(
    plan.spaces
      .flatMap((s) =>
        s.workspaces.flatMap((w) => [...w.sections].sort((a, b) => a.priority - b.priority)),
      )
      .map((sec) => sec.title),
  );

  const reasons = uniqueNonEmpty([
    ctx.week_one_priority,
    ...ctx.chaos_areas,
    ...ctx.roles,
    ...ctx.life_contexts,
    ...ctx.data_sources,
  ]);

  const out: Callout[] = [];
  for (let i = 0; i < Math.min(MAX_CALLOUTS, sections.length); i++) {
    out.push({
      section: sections[i],
      // Pair each section with a distinct real reason; fall back to the first
      // reason when the user gave fewer answers than sections.
      reason: reasons[i] ?? reasons[0] ?? "",
    });
  }
  return out;
}
