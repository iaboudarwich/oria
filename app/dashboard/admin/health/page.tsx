import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { isCurrentUserAdmin } from "@/lib/data/admin";
import { getSystemHealth, type FailedItem } from "@/lib/data/system-health";
import { recoverStuckUploadsAcrossOrgs } from "@/lib/data/stuck-uploads";
import type { SystemEvent } from "@/lib/data/system-events";

export const metadata = { title: "System Health" };
export const dynamic = "force-dynamic";

export default async function AdminHealthPage() {
  const admin = await isCurrentUserAdmin();
  if (!admin) {
    return <NotAuthorized />;
  }

  // Janitor sweep: any operator visit doubles as a cross-org stuck-
  // upload recovery pass. Fires in after() so it doesn't block the
  // page, scoped to ops only because this is an admin route.
  await recoverStuckUploadsAcrossOrgs();

  const h = await getSystemHealth();

  return (
    <>
      <Topbar title="System Health" />

      <p className="mb-6 max-w-2xl px-1 text-[13px] text-ink-muted">
        Read-only operator dashboard. Numbers refresh on every page load.
        No destructive actions live here.
      </p>

      <div className="space-y-7 animate-fade-up">
        {h.warnings.length > 0 ? <WarningsCard warnings={h.warnings} /> : null}

        <SectionGrid title="AI usage">
          <Stat
            label="Today"
            value={h.ai.today.toLocaleString()}
            hint="Ask + Work agent + reports"
          />
          <Stat label="Past 7 days" value={h.ai.past7.toLocaleString()} />
          <Stat label="Past 30 days" value={h.ai.past30.toLocaleString()} />
          <Stat
            label="Errors today"
            value={h.ai.errorsToday.toLocaleString()}
            tone={h.ai.errorsToday > 0 ? "warn" : "ok"}
            hint={`${h.ai.errors7d} in past 7d`}
          />
        </SectionGrid>

        <SectionGrid title="AI cost (estimated, past 30d)">
          <Stat
            label="Input tokens"
            value={h.ai.inputTokens30d.toLocaleString()}
          />
          <Stat
            label="Output tokens"
            value={h.ai.outputTokens30d.toLocaleString()}
          />
          <Stat
            label="Estimated USD"
            value={`$${h.ai.estimatedCostUsd30d.toFixed(2)}`}
            hint="Rough; all Claude surfaces."
          />
          <Stat
            label="Extractions reused"
            value={h.ai.reused30d.toLocaleString()}
            hint="Identical re-uploads — Claude calls avoided"
          />
          <Stat
            label="Source of truth"
            value="console.anthropic.com"
            hint="Login for invoiced billing."
          />
        </SectionGrid>

        {h.ai.recentErrors.length > 0 ? (
          <EventsCard
            title="Recent AI errors"
            events={h.ai.recentErrors}
          />
        ) : null}

        {h.ai.topActors.length > 0 || h.ai.byVia.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {h.ai.topActors.length > 0 ? (
              <Card title="Top users — past 7 days">
                <SimpleList
                  rows={h.ai.topActors.map((a) => ({
                    left: a.actor,
                    right: a.count.toLocaleString(),
                  }))}
                />
              </Card>
            ) : null}
            {h.ai.byVia.length > 0 ? (
              <Card title="By surface — past 7 days">
                <SimpleList
                  rows={h.ai.byVia.map((v) => ({
                    left: v.via,
                    right: v.count.toLocaleString(),
                  }))}
                />
              </Card>
            ) : null}
          </div>
        ) : null}

        <SectionGrid title="Supabase storage">
          <Stat label="Total bytes" value={formatBytes(h.storage.totalBytes)} />
          <Stat label="Files" value={h.storage.totalFiles.toLocaleString()} />
          <Stat
            label="Pending extraction"
            value={h.storage.pendingCount.toLocaleString()}
            tone={h.storage.pendingCount > 5 ? "warn" : "ok"}
          />
          <Stat
            label="Failed"
            value={h.storage.failedCount.toLocaleString()}
            tone={h.storage.failedCount > 0 ? "warn" : "ok"}
          />
        </SectionGrid>

        {h.storage.perOrg.length > 0 || h.storage.topUsers.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {h.storage.perOrg.length > 0 ? (
              <Card title="Storage by space">
                <SimpleList
                  rows={h.storage.perOrg.map((o) => ({
                    left: o.orgName,
                    right: `${formatBytes(o.bytes)} · ${o.files} file${o.files === 1 ? "" : "s"}`,
                  }))}
                />
              </Card>
            ) : null}
            {h.storage.topUsers.length > 0 ? (
              <Card
                title={`Top uploaders — cap ${formatBytes(h.storage.userCapBytes)}`}
              >
                <SimpleList
                  rows={h.storage.topUsers.map((u) => ({
                    left: u.name,
                    right: `${formatBytes(u.bytes)} (${Math.round(u.capRatio * 100)}%) · ${u.files} file${u.files === 1 ? "" : "s"}`,
                  }))}
                />
              </Card>
            ) : null}
          </div>
        ) : null}

        <SectionGrid title="Background jobs">
          <Stat
            label="Completed 24h"
            value={h.jobs.completed24h.toLocaleString()}
            hint={
              h.jobs.avgDurationMs24h > 0
                ? `avg ${formatDuration(h.jobs.avgDurationMs24h)}`
                : undefined
            }
          />
          <Stat
            label="Failed 24h"
            value={h.jobs.failed24h.toLocaleString()}
            tone={h.jobs.failed24h > 0 ? "warn" : "ok"}
            hint={`${h.jobs.failed7d} in past 7d`}
          />
          <Stat
            label="In flight"
            value={(h.jobs.pendingNow + h.jobs.processingNow).toLocaleString()}
            hint={`${h.jobs.pendingNow} pending, ${h.jobs.processingNow} running`}
          />
          <Stat
            label="Stuck > 5m"
            value={h.jobs.stuckNow.toLocaleString()}
            tone={h.jobs.stuckNow > 0 ? "warn" : "ok"}
          />
        </SectionGrid>

        {h.jobs.recentFailures.length > 0 ? (
          <Card title="Recent job failures">
            <ul className="space-y-2">
              {h.jobs.recentFailures.map((f) => (
                <li key={f.id} className="text-[12.5px]">
                  <p className="text-ink">
                    <span className="font-medium">{f.kind}</span>{" "}
                    <span className="text-ink-muted">— {f.error}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">
                    {new Date(f.when).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <SectionGrid title="Scope isolation">
          <Stat
            label="Violations 7d"
            value={h.scopeViolations.count7d.toLocaleString()}
            tone={h.scopeViolations.count7d > 0 ? "warn" : "ok"}
            hint="Should always be 0"
          />
        </SectionGrid>
        {h.scopeViolations.recent.length > 0 ? (
          <EventsCard
            title="Recent scope violations"
            events={h.scopeViolations.recent}
          />
        ) : null}

        <SectionGrid title="Per-user quotas (configured)">
          <Stat
            label="Daily upload"
            value={formatBytes(h.quotas.dailyUploadBytes)}
            hint="ORIA_DAILY_UPLOAD_BYTES"
          />
          <Stat
            label="Lifetime storage"
            value={formatBytes(h.quotas.userStorageBytes)}
            hint="ORIA_USER_STORAGE_BYTES"
          />
          <Stat
            label="Daily Ask"
            value={h.quotas.dailyAskRequests.toLocaleString()}
            hint="ORIA_DAILY_ASK_REQUESTS"
          />
          <Stat
            label="30d Ask"
            value={h.quotas.monthlyAskRequests.toLocaleString()}
            hint="ORIA_MONTHLY_ASK_REQUESTS"
          />
        </SectionGrid>

        <SectionGrid title="Database">
          <Stat label="Orgs" value={h.db.organizations.toLocaleString()} />
          <Stat label="Members" value={h.db.memberships.toLocaleString()} />
          <Stat label="Uploads" value={h.db.uploads.toLocaleString()} />
          <Stat label="Items" value={h.db.memoryItems.toLocaleString()} />
          <Stat label="Reminders" value={h.db.reminders.toLocaleString()} />
          <Stat label="Reports" value={h.db.workspaceReports.toLocaleString()} />
          <Stat label="Learning events" value={h.db.learningEvents.toLocaleString()} />
        </SectionGrid>

        <SectionGrid title="Resend email">
          <Stat
            label="API key"
            value={h.env.hasResendKey ? "Configured" : "Missing"}
            tone={h.env.hasResendKey ? "ok" : "warn"}
          />
          <Stat
            label="From address"
            value={h.env.resendFromDomain ?? (h.env.hasResendFrom ? "Set" : "Missing")}
            tone={h.env.hasResendFrom ? "ok" : "warn"}
          />
          <Stat
            label="Sent today"
            value={h.email.sentToday.toLocaleString()}
            hint={`${h.email.sent7d} in past 7d`}
          />
          <Stat
            label="Failed (7d)"
            value={h.email.failed7d.toLocaleString()}
            tone={h.email.failed7d > 0 ? "warn" : "ok"}
          />
        </SectionGrid>

        {h.email.recentFailures.length > 0 ? (
          <EventsCard
            title="Recent email failures"
            events={h.email.recentFailures}
          />
        ) : null}

        <SectionGrid title="Vercel deployment">
          <Stat label="Environment" value={h.deploy.env ?? "—"} />
          <Stat label="Branch" value={h.deploy.branch ?? "—"} />
          <Stat label="Commit" value={h.deploy.commitSha ?? "—"} />
          <Stat label="Region" value={h.deploy.region ?? "—"} />
        </SectionGrid>
        {h.deploy.commitMessage ? (
          <p className="px-1 text-[12px] text-ink-muted">
            Last commit: {h.deploy.commitMessage}
          </p>
        ) : null}

        {h.vercelLive.configured ? (
          <SectionGrid title="Vercel live status">
            <Stat
              label="State"
              value={h.vercelLive.state ?? "—"}
              tone={
                h.vercelLive.state === "READY" || h.vercelLive.state === "ready"
                  ? "ok"
                  : "warn"
              }
              hint={h.vercelLive.reason}
            />
            <Stat label="Branch" value={h.vercelLive.branch ?? "—"} />
            <Stat
              label="URL"
              value={
                h.vercelLive.url
                  ? h.vercelLive.url.replace(/^https?:\/\//, "")
                  : "—"
              }
            />
            <Stat
              label="Deployed"
              value={
                h.vercelLive.createdAt
                  ? new Date(h.vercelLive.createdAt).toLocaleString()
                  : "—"
              }
            />
          </SectionGrid>
        ) : (
          <p className="px-1 text-[12px] text-ink-faint">
            Set <code>VERCEL_API_TOKEN</code> + <code>VERCEL_PROJECT_ID</code>{" "}
            (and optionally <code>VERCEL_TEAM_ID</code>) on Vercel to surface
            live deployment status here.
          </p>
        )}

        <SectionGrid title="Environment">
          <Stat
            label="Supabase URL"
            value={h.env.hasSupabaseUrl ? "Set" : "Missing"}
            tone={h.env.hasSupabaseUrl ? "ok" : "warn"}
          />
          <Stat
            label="Service role key"
            value={h.env.hasSupabaseServiceKey ? "Set" : "Missing"}
            tone={h.env.hasSupabaseServiceKey ? "ok" : "warn"}
          />
          <Stat
            label="Anthropic key"
            value={h.env.hasAnthropicKey ? "Set" : "Missing"}
            tone={h.env.hasAnthropicKey ? "ok" : "warn"}
          />
          <Stat
            label="Site URL"
            value={h.env.hasSiteUrl ? "Set" : "Missing"}
            tone={h.env.hasSiteUrl ? "ok" : "warn"}
          />
          <Stat
            label="Admin emails"
            value={h.env.adminEmailCount.toString()}
            tone={h.env.adminEmailCount > 0 ? "ok" : "warn"}
          />
        </SectionGrid>

        <div className="grid gap-4 lg:grid-cols-2">
          <FailedListCard
            title="Recent failed uploads"
            empty="None — every upload extracted cleanly."
            items={h.failedUploads}
            linkPrefix="/dashboard/uploads/"
          />
          <FailedListCard
            title="Recent failed reports"
            empty="None — every report generated cleanly."
            items={h.failedReports}
            linkPrefix="/dashboard/work/agent/reports/"
          />
        </div>

        <p className="px-1 text-[11.5px] text-ink-faint">
          Generated {new Date(h.generatedAt).toLocaleString()}. Reload this
          page to refresh.
        </p>
      </div>
    </>
  );
}

function NotAuthorized() {
  return (
    <>
      <Topbar title="Not authorized" />
      <div className="max-w-md rounded-2xl border border-line bg-surface-raised p-6">
        <p className="text-[14px] text-ink">
          This page is for operators only.
        </p>
        <p className="mt-2 text-[12.5px] text-ink-muted">
          If you should have access, ask the account owner to add your email
          to the ADMIN_EMAILS env var on Vercel and reload.
        </p>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex h-9 items-center rounded-lg bg-ink px-3.5 text-[12.5px] text-surface transition-base hover:bg-ink-soft"
        >
          Back to dashboard
        </Link>
      </div>
    </>
  );
}

/* ----- pieces ------------------------------------------------------------ */

function SectionGrid({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
        {title}
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {children}
      </ul>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "ok",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn";
}) {
  return (
    <li className="rounded-2xl border border-line bg-surface-raised p-4">
      <p className="text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </p>
      <p
        className={`mt-1 text-[18px] font-semibold tracking-tight ${
          tone === "warn" ? "text-claret" : "text-ink"
        }`}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-[11px] text-ink-faint">{hint}</p>
      ) : null}
    </li>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
        {title}
      </h2>
      <div className="rounded-2xl border border-line bg-surface-raised p-4">
        {children}
      </div>
    </section>
  );
}

/**
 * Recent system_events list. Shows kind/message + a short context line
 * (status code, surface, target). Keeps the layout calm; no JSON dumps.
 */
function EventsCard({
  title,
  events,
}: {
  title: string;
  events: SystemEvent[];
}) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
        {title}
      </h2>
      <ul className="rounded-2xl border border-line bg-surface-raised divide-y divide-line">
        {events.map((e) => (
          <li key={e.id} className="px-4 py-3">
            <p className="truncate text-[13px] text-ink">
              {e.message ?? e.kind}
            </p>
            <p className="mt-0.5 text-[11.5px] text-ink-faint">
              {summarizeContext(e)} · {new Date(e.created_at).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function summarizeContext(e: SystemEvent): string {
  const c = e.context ?? {};
  const bits: string[] = [];
  if (typeof c.surface === "string") bits.push(c.surface);
  if (typeof c.statusCode === "number") bits.push(`HTTP ${c.statusCode}`);
  if (typeof c.model === "string") bits.push(c.model);
  if (typeof c.to === "string") bits.push(`to ${c.to}`);
  return bits.length > 0 ? bits.join(" · ") : e.kind;
}

function SimpleList({
  rows,
}: {
  rows: Array<{ left: string; right: string }>;
}) {
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => (
        <li
          key={i}
          className="flex items-baseline justify-between gap-3 text-[13px]"
        >
          <span className="min-w-0 truncate text-ink">{r.left}</span>
          <span className="shrink-0 text-ink-muted">{r.right}</span>
        </li>
      ))}
    </ul>
  );
}

function FailedListCard({
  title,
  empty,
  items,
  linkPrefix,
}: {
  title: string;
  empty: string;
  items: FailedItem[];
  linkPrefix: string;
}) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
        {title}
      </h2>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface-raised p-4">
          <p className="text-[12.5px] text-ink-faint">{empty}</p>
        </div>
      ) : (
        <ul className="rounded-2xl border border-line bg-surface-raised divide-y divide-line">
          {items.map((it) => (
            <li key={it.id} className="px-4 py-3">
              <Link
                href={`${linkPrefix}${it.id}`}
                className="block text-[13px] text-ink transition-base hover:text-ink-soft"
              >
                {it.title}
              </Link>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {it.reason}
                {it.spaceName ? ` · ${it.spaceName}` : ""} ·{" "}
                {new Date(it.when).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WarningsCard({ warnings }: { warnings: string[] }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
        Warnings
      </h2>
      <ul className="rounded-2xl border border-claret/20 bg-claret/5 divide-y divide-claret/10">
        {warnings.map((w, i) => (
          <li key={i} className="px-4 py-3 text-[13px] text-claret">
            {w}
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = s / 60;
  return `${m.toFixed(1)} m`;
}
