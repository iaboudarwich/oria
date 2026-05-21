import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Read-only system-health aggregations for the Admin page.
 *
 * Uses the service-role admin client because the whole point of this
 * surface is cross-org visibility ("how many uploads across the entire
 * platform"). Never expose the data returned here to anyone other than
 * an authenticated admin — the caller (the admin page) must check
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
};

export type StorageStats = {
  totalBytes: number;
  totalFiles: number;
  pendingCount: number;
  failedCount: number;
  perOrg: Array<{ orgId: string; orgName: string; bytes: number; files: number }>;
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

export type SystemHealth = {
  ai: AiUsage;
  storage: StorageStats;
  db: DbStats;
  env: EnvStatus;
  deploy: DeployInfo;
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
    storage,
    db,
    failedUploads,
    failedReports,
  ] = await Promise.all([
    collectAiUsage(admin),
    collectStorage(admin, orgById),
    collectDbStats(admin),
    collectFailedUploads(admin, orgById),
    collectFailedReports(admin, orgById),
  ]);

  const env = collectEnvStatus();
  const deploy = collectDeployInfo();
  const warnings = collectWarnings({
    env,
    storage,
    failedUploads,
    failedReports,
  });

  return {
    ai,
    storage,
    db,
    env,
    deploy,
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

  return {
    today: todayRes.count ?? 0,
    past7: week.count ?? 0,
    past30: month.count ?? 0,
    topActors,
    byVia: byViaArr,
  };
}

async function collectStorage(
  admin: AdminClient,
  orgById: Map<string, { id: string; name: string; kind: string }>,
): Promise<StorageStats> {
  const [totalsRes, pendingRes, failedRes] = await Promise.all([
    admin
      .from("uploads")
      .select("size_bytes, organization_id, deleted_at")
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
  };
  const rows = (totalsRes.data ?? []) as Row[];

  let totalBytes = 0;
  const byOrg = new Map<string, { bytes: number; files: number }>();
  for (const r of rows) {
    const size = r.size_bytes ?? 0;
    totalBytes += size;
    const prev = byOrg.get(r.organization_id) ?? { bytes: 0, files: 0 };
    prev.bytes += size;
    prev.files += 1;
    byOrg.set(r.organization_id, prev);
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

  return {
    totalBytes,
    totalFiles: rows.length,
    pendingCount: pendingRes.count ?? 0,
    failedCount: failedRes.count ?? 0,
    perOrg,
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

function collectWarnings(args: {
  env: EnvStatus;
  storage: StorageStats;
  failedUploads: FailedItem[];
  failedReports: FailedItem[];
}): string[] {
  const out: string[] = [];
  if (!args.env.hasAnthropicKey) {
    out.push("ANTHROPIC_API_KEY missing — Ask Oria and extraction will degrade to the no-AI path.");
  }
  if (!args.env.hasResendKey || !args.env.hasResendFrom) {
    out.push("Resend not fully configured — invite emails won't send. Owners can still copy the link/code.");
  }
  if (!args.env.hasSupabaseServiceKey) {
    out.push("SUPABASE_SERVICE_ROLE_KEY missing — admin client features (bootstrap, this page) won't work.");
  }
  if (args.env.adminEmailCount === 0) {
    out.push("ADMIN_EMAILS is empty — nobody can reach this page in production (you're seeing it locally / by env override).");
  }
  if (args.storage.pendingCount > 5) {
    out.push(`${args.storage.pendingCount} uploads stuck in processing — background extraction may be lagging.`);
  }
  if (args.failedUploads.length >= 5) {
    out.push(`${args.failedUploads.length}+ uploads failed extraction recently — check Vercel logs for the Resend / Claude error.`);
  }
  if (args.failedReports.length >= 3) {
    out.push(`${args.failedReports.length}+ Work reports failed recently — check the report detail for the model error.`);
  }
  return out;
}
