import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { isCurrentUserAdmin } from "@/lib/data/admin";
import { getSystemHealth, type FailedItem } from "@/lib/data/system-health";

export const metadata = { title: "System Health" };
export const dynamic = "force-dynamic";

export default async function AdminHealthPage() {
  const admin = await isCurrentUserAdmin();
  if (!admin) {
    return <NotAuthorized />;
  }

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
          <Stat label="Today" value={h.ai.today.toLocaleString()} hint="Ask Oria + Work agent + reports" />
          <Stat label="Past 7 days" value={h.ai.past7.toLocaleString()} />
          <Stat label="Past 30 days" value={h.ai.past30.toLocaleString()} />
        </SectionGrid>

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
            label="Send failures"
            value="See Vercel logs"
            hint="Filter for [send-invite]"
          />
        </SectionGrid>

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
