import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchRecoveries,
  fetchSleeps,
  fetchCycles,
  type WhoopRecovery,
  type WhoopSleep,
  type WhoopCycle,
} from "./oauth";
import {
  getFreshWhoopAccessToken,
  markConnectionError,
  markConnectionSynced,
  listActiveWhoopConnectionIds,
} from "./connections";

/**
 * Pull recovery, sleep, and day strain/energy from WHOOP into health_metrics,
 * one row per UTC day. Idempotent: each day UPSERTs on
 * (user_id, metric_date, source), so re-syncing an overlapping window updates
 * the same rows instead of duplicating. A 14-day rolling window keeps the cron
 * cheap while still backfilling a device that was offline for a few days.
 */

const WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

type DayAgg = {
  recovery_score: number | null;
  resting_heart_rate: number | null;
  hrv_milli: number | null;
  sleep_performance: number | null;
  sleep_total_minutes: number | null;
  sleep_efficiency: number | null;
  day_strain: number | null;
  day_kilojoule: number | null;
  avg_heart_rate: number | null;
};

function emptyDay(): DayAgg {
  return {
    recovery_score: null,
    resting_heart_rate: null,
    hrv_milli: null,
    sleep_performance: null,
    sleep_total_minutes: null,
    sleep_efficiency: null,
    day_strain: null,
    day_kilojoule: null,
    avg_heart_rate: null,
  };
}

function dayKey(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Resolve the org a user's health rows belong to: their personal space, else
 *  their oldest membership. Health is the user's own data; org is for context
 *  and to let the per-space surfaces read it. Null is acceptable. */
async function resolvePrimaryOrgId(userId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data: mems } = await admin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", userId);
  const orgIds = ((mems as { organization_id: string }[]) ?? []).map((m) => m.organization_id);
  if (orgIds.length === 0) return null;

  const { data: orgs } = await admin
    .from("organizations")
    .select("id, kind, created_at")
    .in("id", orgIds)
    .is("deleted_at", null);
  const rows = (orgs as { id: string; kind: string | null; created_at: string }[]) ?? [];
  if (rows.length === 0) return null;

  const personal = rows.find((r) => r.kind === "personal");
  if (personal) return personal.id;
  rows.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  return rows[0]?.id ?? null;
}

export type WhoopSyncResult = { ok: boolean; days: number; error?: string };

export async function syncWhoopConnection(connectionId: string): Promise<WhoopSyncResult> {
  const fresh = await getFreshWhoopAccessToken(connectionId);
  if (!fresh) return { ok: false, days: 0, error: "no_token" };

  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_DAYS * DAY_MS);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  let recoveries: WhoopRecovery[];
  let sleeps: WhoopSleep[];
  let cycles: WhoopCycle[];
  try {
    [recoveries, sleeps, cycles] = await Promise.all([
      fetchRecoveries(fresh.accessToken, startIso, endIso),
      fetchSleeps(fresh.accessToken, startIso, endIso),
      fetchCycles(fresh.accessToken, startIso, endIso),
    ]);
  } catch {
    await markConnectionError(connectionId, "WHOOP did not respond. Oria will try again.");
    return { ok: false, days: 0, error: "fetch_failed" };
  }

  const byDay = new Map<string, DayAgg>();
  const get = (key: string) => {
    let d = byDay.get(key);
    if (!d) {
      d = emptyDay();
      byDay.set(key, d);
    }
    return d;
  };

  for (const r of recoveries) {
    const key = dayKey(r.created_at);
    if (!key || !r.score) continue;
    const d = get(key);
    if (r.score.recovery_score !== undefined) d.recovery_score = Math.round(r.score.recovery_score);
    if (r.score.resting_heart_rate !== undefined)
      d.resting_heart_rate = Math.round(r.score.resting_heart_rate);
    if (r.score.hrv_rmssd_milli !== undefined) d.hrv_milli = r.score.hrv_rmssd_milli;
  }

  for (const s of sleeps) {
    if (s.nap) continue; // the night's sleep is the daily signal, not naps
    const key = dayKey(s.end ?? s.start);
    if (!key || !s.score) continue;
    const d = get(key);
    if (s.score.sleep_performance_percentage !== undefined)
      d.sleep_performance = Math.round(s.score.sleep_performance_percentage);
    if (s.score.sleep_efficiency_percentage !== undefined)
      d.sleep_efficiency = Math.round(s.score.sleep_efficiency_percentage);
    const ss = s.score.stage_summary;
    if (ss) {
      const asleepMilli =
        (ss.total_light_sleep_time_milli ?? 0) +
        (ss.total_slow_wave_sleep_time_milli ?? 0) +
        (ss.total_rem_sleep_time_milli ?? 0);
      if (asleepMilli > 0) d.sleep_total_minutes = Math.round(asleepMilli / 60000);
    }
  }

  for (const c of cycles) {
    const key = dayKey(c.start);
    if (!key || !c.score) continue;
    const d = get(key);
    if (c.score.strain !== undefined) d.day_strain = Math.round(c.score.strain * 10) / 10;
    if (c.score.kilojoule !== undefined) d.day_kilojoule = Math.round(c.score.kilojoule);
    if (c.score.average_heart_rate !== undefined)
      d.avg_heart_rate = Math.round(c.score.average_heart_rate);
  }

  if (byDay.size === 0) {
    await markConnectionSynced(connectionId);
    return { ok: true, days: 0 };
  }

  const organizationId = await resolvePrimaryOrgId(fresh.userId);
  const nowIso = new Date().toISOString();
  const rows = [...byDay.entries()].map(([metric_date, agg]) => ({
    user_id: fresh.userId,
    organization_id: organizationId,
    metric_date,
    source: "whoop",
    ...agg,
    updated_at: nowIso,
  }));

  const admin = createAdminClient();
  const { error } = await admin
    .from("health_metrics")
    .upsert(rows, { onConflict: "user_id,metric_date,source" });
  if (error) {
    await markConnectionError(connectionId, "Oria could not save the latest WHOOP data.");
    return { ok: false, days: 0, error: "save_failed" };
  }

  await markConnectionSynced(connectionId);
  return { ok: true, days: rows.length };
}

/** Sync every active WHOOP connection (the cron entry point). */
export async function syncAllWhoopConnections(): Promise<{
  connections: number;
  days: number;
}> {
  const conns = await listActiveWhoopConnectionIds();
  let days = 0;
  for (const c of conns) {
    const res = await syncWhoopConnection(c.id);
    if (res.ok) days += res.days;
  }
  return { connections: conns.length, days };
}
