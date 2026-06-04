import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/data/audit-log";
import { decayStep, decayConfig } from "./decay";

/**
 * Pattern memory (Round 14.6): the behavioral substrate Round 20 and the
 * suggestion-learning loop will consume. Observations reinforce a per-user
 * (type, key) score; the daily cron decays unreinforced ones.
 *
 * Reinforcement is best-effort and must never break the action that triggered
 * it (a suggestion response, an Ask). The first time a given pattern key is
 * seen for a user it is audit-logged (pattern.learned); later reinforcements
 * ride on their already-audited source events, so the log stays signal, not
 * noise.
 */

export type PatternType = "suggestion_affinity" | "active_hour";

/** Reinforce (or first-create) a pattern observation. delta may be negative
 *  (e.g. a dismissed suggestion nudges affinity down). Never throws. */
export async function recordPattern(input: {
  userId: string;
  type: PatternType;
  key: string;
  delta: number;
  organizationId?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("user_patterns")
      .select("id, score, observation_count")
      .eq("user_id", input.userId)
      .eq("pattern_type", input.type)
      .eq("pattern_key", input.key)
      .maybeSingle();

    if (existing) {
      await admin
        .from("user_patterns")
        .update({
          score: Number(existing.score) + input.delta,
          observation_count: (existing.observation_count as number) + 1,
          last_observed_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      return;
    }

    const { error } = await admin.from("user_patterns").insert({
      user_id: input.userId,
      pattern_type: input.type,
      pattern_key: input.key,
      score: input.delta,
      observation_count: 1,
    });
    if (error) {
      // Lost a race to create the row; reinforce the now-existing one.
      const { data: row } = await admin
        .from("user_patterns")
        .select("id, score, observation_count")
        .eq("user_id", input.userId)
        .eq("pattern_type", input.type)
        .eq("pattern_key", input.key)
        .maybeSingle();
      if (row) {
        await admin
          .from("user_patterns")
          .update({
            score: Number(row.score) + input.delta,
            observation_count: (row.observation_count as number) + 1,
            last_observed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      }
      return;
    }

    // Newly learned pattern: audit once.
    await logAuditEvent({
      userId: input.userId,
      action: "pattern.learned",
      organizationId: input.organizationId ?? null,
      resourceType: "pattern",
      metadata: { pattern_type: input.type, pattern_key: input.key },
    });
  } catch {
    // Best-effort: pattern memory must never break the triggering action.
  }
}

/**
 * Daily decay pass (called by the daily-loop cron, gated to once per day).
 * Ages every pattern not reinforced since the start of the UTC day and prunes
 * the ones that fall below the floor. Returns counts for the cron response.
 */
export async function runPatternDecay(now: Date): Promise<{ decayed: number; pruned: number }> {
  const admin = createAdminClient();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const { factor, floor } = decayConfig();

  const { data } = await admin
    .from("user_patterns")
    .select("id, score, last_observed_at")
    .lt("last_observed_at", dayStart.toISOString());

  let decayed = 0;
  let pruned = 0;
  for (const row of data ?? []) {
    const step = decayStep({
      score: Number(row.score),
      lastObservedAtMs: new Date(row.last_observed_at as string).getTime(),
      dayStartMs: dayStart.getTime(),
      factor,
      floor,
    });
    if (step.action === "delete") {
      await admin.from("user_patterns").delete().eq("id", row.id);
      pruned += 1;
    } else if (step.action === "update") {
      await admin.from("user_patterns").update({ score: step.score }).eq("id", row.id);
      decayed += 1;
    }
  }
  return { decayed, pruned };
}
