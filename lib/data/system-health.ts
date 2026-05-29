import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  countEvents,
  listRecentEvents,
  sumEventContextFields,
  type SystemEvent,
} from "./system-events";
import { getJobsHealth, type JobsHealth } from "./jobs";
import { getQuotaLimits } from "./quotas";

/**
 * Read-only system-health aggregations for the Admin page.
 *
 * Uses the service-role admin client because the whole point of this
 * surface is cross-org visibility ("how many uploads across the entire
 * platform"). Never expose the data returned here to anyone other than
 * an authenticated admin. the caller (the admin page) must check
 * isCurrentUserAdmin() first.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
const sinceDays = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();

export type AiUsage = {
  today: number;
  past7: number;
  past30: number;
  topActors: Array<{ actor: string; count: number }>;
  byVia: Array<{ via: string; count: number }>;
  /** Errors logged by the AI pipeline. Captured via system_events. */
  errorsToday: number;
  errors7d: number;
  /** Token totals over the last 30 days across every Claude surface
   *  (extract, text-extract, report, sort, and the streaming Ask/Work
   *  agents). Captured via the ai.request telemetry events. */
  inputTokens30d: number;
  outputTokens30d: number;
  /** Sum of estimated costs we attached at log time. Treat as rough. */
  estimatedCostUsd30d: number;
  /** Identical-content uploads whose extraction was skipped by cloning a
   *  prior result over the last 30 days. Claude calls avoided. */
  reused30d: number;
  recentErrors: SystemEvent[];
};

export type EmailStats = {
  sentToday: number;
  sent7d: number;
  failed7d: number;
  recentFailures: SystemEvent[];
};

export type VercelLive = {
  configured: boolean;
  state?: string;
  url?: string;
  createdAt?: string;
  branch?: string;
  reason?: string;
};

export type AuthStats = {
  totalProfiles: number;
};

export type StorageStats = {
  totalBytes: number;
  totalFiles: number;
  pendingCount: number;
  failedCount: number;
  perOrg: Array<{ orgId: string; orgName: string; bytes: number; files: number }>;
  /** Top uploaders by lifetime bytes stored. Cross-org. */
  topUsers: Array<{
    userId: string;
    name: string;
    bytes: number;
    files: number;
    /** 0..1 of the per-user storage cap; >= 0.8 → "approaching". */
    capRatio: number;
  }>;
  /** The configured ORIA_USER_STORAGE_BYTES (per-user lifetime cap). */
  userCapBytes: number;
};

export type DbStats = {
  organizations: number;
  memberships: number;
  uploads: number;
  memoryItems: number;
  reminders: number;
  workspaceReports: number;
  learningEvents: number;
};

export type EnvStatus = {
  hasSupabaseUrl: boolean;
  hasSupabaseAnonKey: boolean;
  hasSupabaseServiceKey: boolean;
  hasAnthropicKey: boolean;
  hasResendKey: boolean;
  hasResendFrom: boolean;
  hasSiteUrl: boolean;
  resendFromDomain: string | null;
  adminEmailCount: number;
};

export type DeployInfo = {
  env: string | null;
  branch: string | null;
  commitSha: string | null;
  commitMessage: string | null;
  deploymentId: string | null;
  region: string | null;
  url: string | null;
};

export type FailedItem = {
  id: string;
  title: string;
  reason: string;
  when: string;
  spaceName: string | null;
};

export type QuotaSummary = {
  dailyUploadBytes: number;
  dailyAskRequests: number;
  userStorageBytes: number;
  monthlyAskRequests: number;
};

export type ScopeViolations = {
  /** Count of scope.violation events in the last 7 days. */
  count7d: number;
  /** Latest 10 events for inspection. */
  recent: SystemEvent[];
};

export type SystemHealth = {
  ai: AiUsage;
  email: EmailStats;
  storage: StorageStats;
  db: DbStats;
  env: EnvStatus;
  deploy: DeployInfo;
  vercelLive: VercelLive;
  jobs: JobsHealth;
  quotas: QuotaSummary;
  scopeViolations: ScopeViolations;
  failedUploads: FailedItem[];
  failedReports: FailedItem[];
  warnings: string[];
  generatedAt: string;
};

export async function getSystemHealth(): Promise<SystemHealth> {
  const admin = createAdminClient();
  const orgsRes = await admin.from("organizations").select("id, name, kind");
  type OrgRow = { id: string; name: string; kind: string };
  const orgs = (orgsRes.data ?? []) as OrgRow[];
  const orgById = new Map(orgs.map((o) => [o.id, o] as const));

  const [
    ai,
    email,
    storage,
    db,
    failedUploads,
    failedReports,
    vercelLive,
    jobs,
    scopeViolations,
  ] = await Promise.all([
    collectAiUsage(admin),
    collectEmailStats(),
    collectStorage(admin, orgById),
    collectDbStats(admin),
    collectFailedUploads(admin, orgById),
    collectFailedReports(admin, orgById),
    collectVercelLive(),
    getJobsHealth(),
    collectScopeViolations(),
  ]);

  const env = collectEnvStatus();
  const deploy = collectDeployInfo();
  const quotas = getQuotaLimits();
  const warnings = collectWarnings({
    env,
    ai,
    email,
    storage,
    failedUploads,
    failedReports,
    jobs,
    scopeViolations,
  });

  return {
    ai,
    email,
    storage,
    db,
    env,
    deploy,
    vercelLive,
    jobs,
    quotas,
    scopeViolations,
    failedUploads,
    failedReports,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------- */
/* Sections                                                             */
/* ------------------------------------------------------------------- */

type AdminClient = ReturnType<typeof createAdminClient>;

async function collectAiUsage(admin: AdminClient): Promise<AiUsage> {
  const [todayRes, week, month, byActor, byVia] = await Promise.all([
    admin
      .from("learning_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", "search.queried")
      .gte("created_at", todayStart()),
    admin
      .from("learning_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", "search.queried")
      .gte("created_at", sinceDays(7)),
    admin
      .from("learning_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", "search.queried")
      .gte("created_at", sinceDays(30)),
    admin
      .from("learning_events")
      .select("actor_id")
      .eq("kind", "search.queried")
      .gte("created_at", sinceDays(7))
      .limit(500),
    admin
      .from("learning_events")
      .select("payload")
      .eq("kind", "search.queried")
      .gte("created_at", sinceDays(7))
      .limit(500),
  ]);

  const actorRows = (byActor.data ?? []) as Array<{ actor_id: string | null }>;
  const actorCounts = new Map<string, number>();
  for (const row of actorRows) {
    if (!row.actor_id) continue;
    actorCounts.set(row.actor_id, (actorCounts.get(row.actor_id) ?? 0) + 1);
  }
  const topActorIds = Array.from(actorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  let topActors: Array<{ actor: string; count: number }> = [];
  if (topActorIds.length > 0) {
    const ids = topActorIds.map(([id]) => id);
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", ids);
    const byId = new Map(
      ((profiles ?? []) as Array<{ id: string; email: string; full_name: string | null }>).map(
        (p) => [p.id, p] as const,
      ),
    );
    topActors = topActorIds.map(([id, count]) => {
      const p = byId.get(id);
      return {
        actor: p?.full_name?.trim() || p?.email || id.slice(0, 8),
        count,
      };
    });
  }

  const viaRows = (byVia.data ?? []) as Array<{
    payload: Record<string, unknown> | null;
  }>;
  const viaCounts = new Map<string, number>();
  for (const row of viaRows) {
    const v = typeof row.payload?.via === "string" ? row.payload.via : "unknown";
    viaCounts.set(v, (viaCounts.get(v) ?? 0) + 1);
  }
  const byViaArr = Array.from(viaCounts.entries())
    .map(([via, count]) => ({ via, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // One query for all three numeric totals over the same row set;
  // previously three separate limit(5000) pulls of the exact same
  // ai.request rows. At a few thousand events that's the difference
  // between a snappy admin page and 3–5 seconds of blocking I/O.
  const [
    errorsToday,
    errors7d,
    aiTotals,
    recentErrors,
    reused30d,
  ] = await Promise.all([
    countEvents({ kind: "ai.error", sinceISO: todayStart() }),
    countEvents({ kind: "ai.error", sinceISO: sinceDays(7) }),
    sumEventContextFields({
      kind: "ai.request",
      fields: ["input_tokens", "output_tokens", "cost_usd"],
      sinceISO: sinceDays(30),
    }),
    listRecentEvents({ kind: "ai.error", limit: 10 }),
    // Identical-content uploads whose extraction we skipped by cloning a
    // prior result. Claude calls avoided, money saved.
    countEvents({ kind: "extraction.reused", sinceISO: sinceDays(30) }),
  ]);

  return {
    today: todayRes.count ?? 0,
    past7: week.count ?? 0,
    past30: month.count ?? 0,
    topActors,
    byVia: byViaArr,
    errorsToday,
    errors7d,
    inputTokens30d: aiTotals.input_tokens,
    outputTokens30d: aiTotals.output_tokens,
    estimatedCostUsd30d: Math.round(aiTotals.cost_usd * 10000) / 10000,
    reused30d,
    recentErrors,
  };
}

async function collectStorage(
  admin: AdminClient,
  orgById: Map<string, { id: string; name: string; kind: string }>,
): Promise<StorageStats> {
  const [totalsRes, pendingRes, failedRes] = await Promise.all([
    admin
      .from("uploads")
      .select("size_bytes, organization_id, uploaded_by, deleted_at")
      .is("deleted_at", null)
      .limit(20000),
    admin
      .from("uploads")
      .select("id", { count: "exact", head: true })
      .in("status", ["received", "processing"])
      .is("deleted_at", null),
    admin
      .from("uploads")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .is("deleted_at", null),
  ]);

  type Row = {
    size_bytes: number | null;
    organization_id: string;
    uploaded_by: string | null;
  };
  const rows = (totalsRes.data ?? []) as Row[];

  let totalBytes = 0;
  const byOrg = new Map<string, { bytes: number; files: number }>();
  const byUser = new Map<string, { bytes: number; files: number }>();
  for (const r of rows) {
    const size = r.size_bytes ?? 0;
    totalBytes += size;
    const prev = byOrg.get(r.organization_id) ?? { bytes: 0, files: 0 };
    prev.bytes += size;
    prev.files += 1;
    byOrg.set(r.organization_id, prev);

    if (r.uploaded_by) {
      const u = byUser.get(r.uploaded_by) ?? { bytes: 0, files: 0 };
      u.bytes += size;
      u.files += 1;
      byUser.set(r.uploaded_by, u);
    }
  }

  const perOrg = Array.from(byOrg.entries())
    .map(([orgId, v]) => ({
      orgId,
      orgName: orgById.get(orgId)?.name ?? orgId.slice(0, 8),
      bytes: v.bytes,
      files: v.files,
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 8);

  const userCapBytes = getQuotaLimits().userStorageBytes;
  const topUserIds = Array.from(byUser.entries())
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 8);

  let topUsers: StorageStats["topUsers"] = [];
  if (topUserIds.length > 0) {
    const ids = topUserIds.map(([id]) => id);
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", ids);
    type ProfileRow = { id: string; email: string; full_name: string | null };
    const byId = new Map(
      ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p] as const),
    );
    topUsers = topUserIds.map(([id, v]) => {
      const p = byId.get(id);
      return {
        userId: id,
        name: p?.full_name?.trim() || p?.email || id.slice(0, 8),
        bytes: v.bytes,
        files: v.files,
        capRatio: userCapBytes > 0 ? Math.min(2, v.bytes / userCapBytes) : 0,
      };
    });
  }

  return {
    totalBytes,
    totalFiles: rows.length,
    pendingCount: pendingRes.count ?? 0,
    failedCount: failedRes.count ?? 0,
    perOrg,
    topUsers,
    userCapBytes,
  };
}

async function collectDbStats(admin: AdminClient): Promise<DbStats> {
  const tables: Array<keyof DbStats> = [
    "organizations",
    "memberships",
    "uploads",
    "memoryItems",
    "reminders",
    "workspaceReports",
    "learningEvents",
  ];
  const tableNames: Record<keyof DbStats, string> = {
    organizations: "organizations",
    memberships: "memberships",
    uploads: "uploads",
    memoryItems: "memory_items",
    reminders: "reminders",
    workspaceReports: "workspace_reports",
    learningEvents: "learning_events",
  };
  const entries = await Promise.all(
    tables.map(async (key) => {
      const { count } = await admin
        .from(tableNames[key])
        .select("id", { count: "exact", head: true });
      return [key, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as DbStats;
}

function collectEnvStatus(): EnvStatus {
  const fromRaw = process.env.RESEND_FROM_EMAIL ?? "";
  const fromDomainMatch = fromRaw.match(/@([^>\s]+)/);
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasSupabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasSupabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasResendKey: !!process.env.RESEND_API_KEY,
    hasResendFrom: !!process.env.RESEND_FROM_EMAIL,
    hasSiteUrl: !!process.env.NEXT_PUBLIC_SITE_URL,
    resendFromDomain: fromDomainMatch ? fromDomainMatch[1] : null,
    adminEmailCount: adminEmails.length,
  };
}

function collectDeployInfo(): DeployInfo {
  return {
    env: process.env.VERCEL_ENV ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    commitMessage:
      process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0]?.slice(0, 120) ??
      null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    region: process.env.VERCEL_REGION ?? null,
    url: process.env.VERCEL_URL ?? null,
  };
}

async function collectFailedUploads(
  admin: AdminClient,
  orgById: Map<string, { id: string; name: string }>,
): Promise<FailedItem[]> {
  const { data } = await admin
    .from("uploads")
    .select("id, title, filename, organization_id, status, metadata, updated_at")
    .or("status.eq.failed,metadata->>extraction_skipped.not.is.null")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(10);
  type Row = {
    id: string;
    title: string | null;
    filename: string;
    organization_id: string;
    status: string;
    metadata: Record<string, unknown> | null;
    updated_at: string;
  };
  return ((data ?? []) as Row[]).map((u) => ({
    id: u.id,
    title: u.title ?? u.filename,
    reason:
      u.status === "failed"
        ? "Processing failed"
        : String(u.metadata?.extraction_skipped ?? "Skipped"),
    when: u.updated_at,
    spaceName: orgById.get(u.organization_id)?.name ?? null,
  }));
}

async function collectFailedReports(
  admin: AdminClient,
  orgById: Map<string, { id: string; name: string }>,
): Promise<FailedItem[]> {
  const { data } = await admin
    .from("workspace_reports")
    .select("id, title, organization_id, error_message, updated_at")
    .eq("status", "failed")
    .order("updated_at", { ascending: false })
    .limit(10);
  type Row = {
    id: string;
    title: string;
    organization_id: string;
    error_message: string | null;
    updated_at: string;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    title: r.title,
    reason: r.error_message ?? "Unknown error",
    when: r.updated_at,
    spaceName: orgById.get(r.organization_id)?.name ?? null,
  }));
}

/**
 * Surface recent scope-violation diagnostics. enforceActiveOrg writes
 * a `scope.violation` system_event whenever a query returns a row that
 * doesn't belong to the active org. these should ALWAYS be zero. Any
 * non-zero count is a real bug to investigate.
 */
async function collectScopeViolations(): Promise<ScopeViolations> {
  const [count7d, recent] = await Promise.all([
    countEvents({ kind: "scope.violation", sinceISO: sinceDays(7) }),
    listRecentEvents({ kind: "scope.violation", limit: 10 }),
  ]);
  return { count7d, recent };
}

async function collectEmailStats(): Promise<EmailStats> {
  const [sentToday, sent7d, failed7d, recentFailures] = await Promise.all([
    countEvents({ kind: "email.sent", sinceISO: todayStart() }),
    countEvents({ kind: "email.sent", sinceISO: sinceDays(7) }),
    countEvents({ kind: "email.error", sinceISO: sinceDays(7) }),
    listRecentEvents({ kind: "email.error", limit: 5 }),
  ]);
  return { sentToday, sent7d, failed7d, recentFailures };
}

/**
 * Try to fetch the most recent deployment from Vercel's REST API.
 * Requires VERCEL_API_TOKEN (a personal or team token) and the standard
 * Vercel project envs. Without those, returns { configured: false } and
 * the page falls back to the env-var-only Deploy info card. We never
 * call this for non-prod runs (it'd just hit the token's rate limit).
 */
async function collectVercelLive(): Promise<VercelLive> {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return { configured: false };

  try {
    const url = new URL("https://api.vercel.com/v6/deployments");
    url.searchParams.set("projectId", projectId);
    url.searchParams.set("limit", "1");
    if (process.env.VERCEL_TEAM_ID) {
      url.searchParams.set("teamId", process.env.VERCEL_TEAM_ID);
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        configured: true,
        state: "unknown",
        reason: `Vercel API ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      deployments?: Array<{
        state?: string;
        url?: string;
        created?: number;
        meta?: { githubCommitRef?: string };
      }>;
    };
    const d = data.deployments?.[0];
    if (!d) return { configured: true, state: "unknown", reason: "No deployments" };
    return {
      configured: true,
      state: d.state ?? "unknown",
      url: d.url,
      createdAt: d.created ? new Date(d.created).toISOString() : undefined,
      branch: d.meta?.githubCommitRef,
    };
  } catch (e) {
    return {
      configured: true,
      state: "unknown",
      reason: e instanceof Error ? e.message : "fetch error",
    };
  }
}

function collectWarnings(args: {
  env: EnvStatus;
  ai: AiUsage;
  email: EmailStats;
  storage: StorageStats;
  failedUploads: FailedItem[];
  failedReports: FailedItem[];
  jobs: JobsHealth;
  scopeViolations: ScopeViolations;
}): string[] {
  const out: string[] = [];
  if (!args.env.hasAnthropicKey) {
    out.push("ANTHROPIC_API_KEY missing. Ask Oria and extraction will degrade to the no-AI path.");
  }
  if (!args.env.hasResendKey || !args.env.hasResendFrom) {
    out.push("Resend not fully configured. invite emails won't send. Owners can still copy the link/code.");
  }
  if (!args.env.hasSupabaseServiceKey) {
    out.push("SUPABASE_SERVICE_ROLE_KEY missing. admin client features (bootstrap, this page) won't work.");
  }
  if (args.env.adminEmailCount === 0) {
    out.push("ADMIN_EMAILS is empty. nobody can reach this page in production (you're seeing it locally / by env override).");
  }
  if (args.storage.pendingCount > 5) {
    out.push(`${args.storage.pendingCount} uploads stuck in processing. background extraction may be lagging.`);
  }
  if (args.failedUploads.length >= 5) {
    out.push(`${args.failedUploads.length}+ uploads failed extraction recently. see Recent failed uploads below.`);
  }
  if (args.failedReports.length >= 3) {
    out.push(`${args.failedReports.length}+ Work reports failed recently. check the report detail for the model error.`);
  }
  if (args.ai.errorsToday >= 5) {
    out.push(`${args.ai.errorsToday} AI errors today. check Claude key, rate limits, and the Recent AI errors list.`);
  }
  if (args.email.failed7d >= 3 && args.email.sent7d === 0) {
    out.push(`${args.email.failed7d} email failures and zero successes in the past week. Resend likely misconfigured.`);
  }

  // Background-job pressure signals.
  if (args.jobs.stuckNow > 0) {
    out.push(`${args.jobs.stuckNow} background job${args.jobs.stuckNow === 1 ? "" : "s"} stuck in processing for over 5 minutes. likely OOM, timeout, or deploy mid-flight.`);
  }
  if (args.jobs.failed24h >= 5) {
    out.push(`${args.jobs.failed24h} background jobs failed in the past 24h. check Recent job failures below.`);
  }

  // Scope-violation signal. this should ALWAYS be zero. Any number
  // is a real privacy bug: a query returned org-scoped rows from the
  // wrong org and the runtime guard caught it. Investigate the call
  // site listed in the system_event context.
  if (args.scopeViolations.count7d > 0) {
    out.push(`${args.scopeViolations.count7d} scope.violation event${args.scopeViolations.count7d === 1 ? "" : "s"} in the past 7 days. a query returned a row from the wrong organization. See Recent scope violations below.`);
  }

  // Storage cap signals (per-user).
  const userCap = args.storage.userCapBytes;
  if (userCap > 0) {
    const atCap = args.storage.topUsers.filter((u) => u.capRatio >= 1);
    const approaching = args.storage.topUsers.filter(
      (u) => u.capRatio >= 0.8 && u.capRatio < 1,
    );
    if (atCap.length > 0) {
      out.push(`${atCap.length} user${atCap.length === 1 ? "" : "s"} at or over the ${formatGb(userCap)} storage cap. they can't upload until they delete files or you raise ORIA_USER_STORAGE_BYTES.`);
    } else if (approaching.length > 0) {
      out.push(`${approaching.length} user${approaching.length === 1 ? "" : "s"} above 80% of the ${formatGb(userCap)} storage cap.`);
    }
  }

  // AI cost signal. visible nudge if estimated 30d spend is starting to matter.
  if (args.ai.estimatedCostUsd30d >= 20) {
    out.push(`Estimated Claude spend over the past 30 days is $${args.ai.estimatedCostUsd30d.toFixed(2)}. confirm against console.anthropic.com if it looks off.`);
  }

  return out;
}

function formatGb(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
