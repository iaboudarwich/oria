import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Beta quotas. Deliberately light: 2–6 testers should be able to upload
 * real receipts, PDFs, and small spreadsheets without bumping into limits.
 * Bumped up later from real usage; lowered if someone misbehaves.
 *
 * Override via env so we can loosen for a specific tester without
 * redeploying:
 *   ORIA_DAILY_UPLOAD_BYTES  (default 300MB)
 *   ORIA_DAILY_ASK_REQUESTS  (default 250)
 */
const DEFAULT_UPLOAD_BYTES_PER_DAY = 300 * 1024 * 1024;
const DEFAULT_ASK_REQUESTS_PER_DAY = 250;

function dailyUploadCap(): number {
  const raw = process.env.ORIA_DAILY_UPLOAD_BYTES;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_UPLOAD_BYTES_PER_DAY;
}

function dailyAskCap(): number {
  const raw = process.env.ORIA_DAILY_ASK_REQUESTS;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ASK_REQUESTS_PER_DAY;
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
