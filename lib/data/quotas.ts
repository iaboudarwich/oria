import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Beta quotas. Deliberately light: 2–6 testers should be able to upload
 * real receipts, PDFs, and small spreadsheets without bumping into limits.
 * Bumped up later from real usage; lowered if someone misbehaves.
 *
 * Override via env so we can loosen for a specific tester without
 * redeploying:
 *   ORIA_DAILY_UPLOAD_BYTES   (default 300MB)
 *   ORIA_DAILY_ASK_REQUESTS   (default 250)
 *   ORIA_USER_STORAGE_BYTES   (default 5GB — lifetime cap per user)
 *   ORIA_MONTHLY_ASK_REQUESTS (default 3000 — rolling 30d cap per user)
 *
 * SCOPE: every check is PER USER, across every org the user belongs to —
 * the queries filter by `uploaded_by` / `actor_id`, never by
 * `organization_id`. A tester who belongs to multiple Workspaces still
 * shares one cap. This is intentional: per-org caps would let a single
 * user multiply their allowance by joining more spaces.
 *
 * Storage warning thresholds (used by admin health, not enforced):
 *   80% of the cap → "approaching"
 *   100%           → "at cap" (the upload action will refuse)
 */
const DEFAULT_UPLOAD_BYTES_PER_DAY = 300 * 1024 * 1024;
const DEFAULT_ASK_REQUESTS_PER_DAY = 250;
const DEFAULT_USER_STORAGE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
const DEFAULT_MONTHLY_ASK_REQUESTS = 3000;

function dailyUploadCap(): number {
  return envInt("ORIA_DAILY_UPLOAD_BYTES", DEFAULT_UPLOAD_BYTES_PER_DAY);
}

function dailyAskCap(): number {
  return envInt("ORIA_DAILY_ASK_REQUESTS", DEFAULT_ASK_REQUESTS_PER_DAY);
}

function userStorageCap(): number {
  return envInt("ORIA_USER_STORAGE_BYTES", DEFAULT_USER_STORAGE_BYTES);
}

function monthlyAskCap(): number {
  return envInt("ORIA_MONTHLY_ASK_REQUESTS", DEFAULT_MONTHLY_ASK_REQUESTS);
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getQuotaLimits() {
  return {
    dailyUploadBytes: dailyUploadCap(),
    dailyAskRequests: dailyAskCap(),
    userStorageBytes: userStorageCap(),
    monthlyAskRequests: monthlyAskCap(),
  };
}

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export type QuotaCheck =
  | { ok: true; remaining: number; limit: number }
  | { ok: false; message: string; limit: number };

/**
 * Returns ok=true when the user has room for `incomingBytes` more today.
 * Uses the admin client so it works regardless of which org the upload
 * lands in. Soft-fails (allows the upload) on any DB error — we'd rather
 * an upload through than block the tester on a transient hiccup.
 */
export async function checkDailyUploadBytes(
  userId: string,
  incomingBytes: number,
): Promise<QuotaCheck> {
  const limit = dailyUploadCap();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("uploads")
    .select("size_bytes")
    .eq("uploaded_by", userId)
    .gte("created_at", startOfTodayISO());
  if (error) {
    return { ok: true, remaining: limit, limit };
  }
  const used = (data ?? []).reduce(
    (acc: number, r: { size_bytes: number | null }) =>
      acc + (r.size_bytes ?? 0),
    0,
  );
  const remaining = Math.max(0, limit - used);
  if (used + incomingBytes > limit) {
    return {
      ok: false,
      limit,
      message: `Daily upload limit reached. You've used ${formatMb(used)} of ${formatMb(limit)} today. Try again tomorrow.`,
    };
  }
  return { ok: true, remaining, limit };
}

/**
 * Returns ok=true when the user has Ask requests left today. Counts every
 * search.queried event tagged via:ask* for this actor since midnight.
 */
export async function checkDailyAskRequests(
  userId: string,
): Promise<QuotaCheck> {
  const limit = dailyAskCap();
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("learning_events")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", userId)
    .eq("kind", "search.queried")
    .gte("created_at", startOfTodayISO());
  if (error) {
    return { ok: true, remaining: limit, limit };
  }
  const used = count ?? 0;
  const remaining = Math.max(0, limit - used);
  if (used >= limit) {
    return {
      ok: false,
      limit,
      message: `You've used today's Ask Oria allowance (${limit} questions). It resets at midnight.`,
    };
  }
  return { ok: true, remaining, limit };
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function formatGb(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Sum of every non-deleted upload owned by this user, across all spaces.
 * Used to enforce ORIA_USER_STORAGE_BYTES at upload time and to surface
 * a "approaching cap" warning on the admin page.
 *
 * Soft-fails open on DB error.
 */
export async function checkTotalUserStorage(
  userId: string,
  incomingBytes: number,
): Promise<QuotaCheck> {
  const limit = userStorageCap();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("uploads")
    .select("size_bytes")
    .eq("uploaded_by", userId)
    .is("deleted_at", null);
  if (error) {
    return { ok: true, remaining: limit, limit };
  }
  const used = (data ?? []).reduce(
    (acc: number, r: { size_bytes: number | null }) =>
      acc + (r.size_bytes ?? 0),
    0,
  );
  if (used + incomingBytes > limit) {
    return {
      ok: false,
      limit,
      message: `Storage limit reached. You've used ${formatGb(used)} of ${formatGb(limit)}. Delete older uploads or ask the admin to raise your cap.`,
    };
  }
  return { ok: true, remaining: limit - used, limit };
}

/**
 * Rolling 30-day Ask count for one user. Doesn't refuse a request on
 * its own — the daily check fires first — but feeds the admin health
 * page so we can spot a user racking up cost over a longer window.
 */
export async function getMonthlyAskUsage(
  userId: string,
): Promise<{ used: number; limit: number }> {
  const limit = monthlyAskCap();
  const admin = createAdminClient();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { count, error } = await admin
    .from("learning_events")
    .select("id", { count: "exact", head: true })
    .eq("actor_id", userId)
    .eq("kind", "search.queried")
    .gte("created_at", since);
  if (error) return { used: 0, limit };
  return { used: count ?? 0, limit };
}
