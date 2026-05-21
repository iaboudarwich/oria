import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { ChartIcon, SparkIcon } from "@/components/ui/icon";
import { AnalysisPrompt } from "@/components/work/analysis-prompt";
import { ReportPoller } from "@/components/work/report-poller";
import { computeAnalysis, type AnalysisAggregates } from "@/lib/data/work";
import { listWorkspaceReports } from "@/lib/data/workspace-reports";
import { listRecentUserQuestions } from "@/lib/data/recent-questions";
import { retryReport } from "@/lib/data/report-actions";

export const metadata = { title: "Analysis" };

export default async function AnalysisPage() {
  const [data, reports, recentQuestions] = await Promise.all([
    computeAnalysis(6),
    listWorkspaceReports(20),
    listRecentUserQuestions({ surface: "work", limit: 3 }),
  ]);
  const analyses = reports.filter(
    (r) => r.kind === "analysis" || r.kind === "custom" || r.kind === "summary",
  );
  const hasPending = analyses.some((r) => r.status === "pending");

  return (
    <>
      <Topbar title="Analysis" />
      <ReportPoller pending={hasPending} />

      <div className="space-y-8 animate-fade-up">
        {!data.hasData ? <EmptyState /> : <AnalysisBoard data={data} />}
        <AnalysisPrompt recentQuestions={recentQuestions} />
        {analyses.length > 0 ? <AnalysisList analyses={analyses} /> : null}
      </div>
    </>
  );
}

function AnalysisList({
  analyses,
}: {
  analyses: Awaited<ReturnType<typeof listWorkspaceReports>>;
}) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
        Recent analyses
      </h2>
      <ul className="space-y-2">
        {analyses.map((a) => (
          <li
            key={a.id}
            className="group flex items-start gap-3 rounded-xl border border-line bg-surface-raised px-4 py-3 transition-base hover:border-line-strong hover:bg-canvas/40"
          >
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-canvas text-ink-soft">
              <ChartIcon size={14} />
            </span>
            <Link
              href={`/dashboard/work/agent/reports/${a.id}`}
              className="min-w-0 flex-1"
            >
              <p className="truncate text-[13.5px] text-ink">{a.title}</p>
              <p className="mt-0.5 truncate text-[11.5px] text-ink-faint">
                {a.kind} · {new Date(a.created_at).toLocaleString()}
              </p>
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`mt-1 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] ${
                  a.status === "ready"
                    ? "bg-sage/15 text-[#3f5240]"
                    : a.status === "failed"
                      ? "bg-claret/10 text-claret"
                      : "bg-accent-soft/60 text-[#7a5a2a]"
                }`}
              >
                {a.status === "ready"
                  ? "Ready"
                  : a.status === "failed"
                    ? "Failed"
                    : `Analyzing · ${analyzingFor(a.created_at)}`}
              </span>
              {a.status === "failed" ? (
                <form action={retryReport}>
                  <input type="hidden" name="id" value={a.id} />
                  <button
                    type="submit"
                    className="mt-1 inline-flex items-center rounded-md border border-line bg-canvas px-1.5 py-0.5 text-[10.5px] text-ink-muted transition-base hover:border-line-strong hover:text-ink"
                  >
                    Retry
                  </button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Compact "how long has this been Analyzing" label. Long-running
 * analyses can sit pending for tens of seconds; the user shouldn't
 * have to guess whether anything is happening. Recomputed per render
 * (so the poller's revalidate pushes a fresh number every few seconds).
 */
function analyzingFor(createdAtISO: string): string {
  const ms = Date.now() - new Date(createdAtISO).getTime();
  if (Number.isNaN(ms) || ms < 0) return "just now";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

function EmptyState() {
  return (
    <div className="animate-fade-up rounded-2xl border border-line bg-surface-raised p-6">
      <p className="text-[14px] text-ink">
        Analysis fills in as you upload invoices, receipts, and statements.
      </p>
      <p className="mt-2 text-[12.5px] text-ink-muted">
        Add documents in{" "}
        <Link
          href="/dashboard/work/finance"
          className="underline decoration-line-strong hover:text-ink"
        >
          Finance
        </Link>{" "}
        or{" "}
        <Link
          href="/dashboard/work/invoices"
          className="underline decoration-line-strong hover:text-ink"
        >
          Invoices
        </Link>
        .
      </p>
    </div>
  );
}

function AnalysisBoard({ data }: { data: AnalysisAggregates }) {
  const totalOut = data.totals.outflow;
  const totalIn = data.totals.inflow;
  const currency = data.totals.currency;
  const net = totalIn - totalOut;
  const margin =
    totalIn > 0 ? Math.round(((totalIn - totalOut) / totalIn) * 1000) / 10 : null;
  const costRevenue =
    totalIn > 0 ? Math.round((totalOut / totalIn) * 1000) / 10 : null;

  // Forecast: simple average of last 3 months of outflow.
  const recent = data.months.slice(-3);
  const forecastOut =
    recent.length > 0
      ? Math.round(
          (recent.reduce((a, b) => a + b.outflow, 0) / recent.length) * 100,
        ) / 100
      : 0;
  const forecastIn =
    recent.length > 0
      ? Math.round(
          (recent.reduce((a, b) => a + b.inflow, 0) / recent.length) * 100,
        ) / 100
      : 0;

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Ratio strip */}
      <section>
        <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
          At a glance
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <RatioCard
            label="Revenue"
            value={formatAmount(totalIn, currency)}
          />
          <RatioCard
            label="Expenses"
            value={formatAmount(totalOut, currency)}
          />
          <RatioCard
            label="Net"
            value={formatAmount(net, currency)}
            tint={net >= 0 ? "text-sage" : "text-claret"}
          />
          <RatioCard
            label={costRevenue !== null ? "Cost / revenue" : "Transactions"}
            value={
              costRevenue !== null
                ? `${costRevenue}%`
                : String(data.totals.transactions)
            }
          />
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue vs Expenses */}
        <section className="lg:col-span-2">
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
            {totalIn > 0 ? "Revenue vs Expenses" : "Spending"}
          </h2>
          <div className="rounded-2xl border border-line bg-surface-raised p-5">
            <FlowsChart months={data.months} />
            <div className="mt-4 flex flex-wrap items-center gap-4 text-[11.5px]">
              {totalIn > 0 ? <LegendDot tint="bg-ink" label="Revenue" /> : null}
              <LegendDot tint="bg-accent" label="Expenses" />
              <span className="ml-auto text-ink-faint">
                Last {data.months.length} months
                {currency ? ` · ${currency}` : ""}
              </span>
            </div>
          </div>
        </section>

        {/* Forecast next month */}
        <aside>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
            Next month forecast
          </h2>
          <div className="rounded-2xl border border-line bg-surface-raised p-5">
            <p className="text-[11.5px] uppercase tracking-[0.12em] text-ink-faint">
              Expected expenses
            </p>
            <p className="mt-1 text-[28px] font-semibold tracking-tight text-ink">
              {formatAmountTight(forecastOut, currency)}
            </p>
            {totalIn > 0 ? (
              <>
                <hr className="my-4 border-line" />
                <p className="text-[11.5px] uppercase tracking-[0.12em] text-ink-faint">
                  Expected revenue
                </p>
                <p className="mt-1 text-[28px] font-semibold tracking-tight text-ink">
                  {formatAmountTight(forecastIn, currency)}
                </p>
                {margin !== null ? (
                  <p className="mt-1 text-[12px] text-ink-muted">
                    Recent margin: {margin}%
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-[12px] text-ink-faint">
                3-month rolling average
              </p>
            )}
          </div>
        </aside>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top spend by merchant */}
        <section>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
            Top spend by vendor
          </h2>
          {data.topMerchants.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface-raised p-5">
              <p className="text-[12.5px] text-ink-faint">
                No merchants identified yet.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-surface-raised p-5">
              <MerchantBars rows={data.topMerchants} />
            </div>
          )}
        </section>

        {/* Anomalies */}
        <section>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
            Anomalies
          </h2>
          {data.anomalies.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface-raised p-5">
              <p className="text-[12.5px] text-ink-faint">
                Nothing flagged. Oria surfaces items more than 2x a vendor&apos;s
                rolling average.
              </p>
            </div>
          ) : (
            <ul className="rounded-2xl border border-line bg-surface-raised divide-y divide-line">
              {data.anomalies.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-claret/10 text-claret">
                    <SparkIcon size={11} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {a.upload_id ? (
                      <Link
                        href={`/dashboard/uploads/${a.upload_id}`}
                        className="truncate text-[13px] text-ink transition-base hover:text-ink-soft"
                      >
                        {a.title}
                      </Link>
                    ) : (
                      <p className="truncate text-[13px] text-ink">{a.title}</p>
                    )}
                    <p className="mt-0.5 text-[11.5px] text-ink-faint">
                      {a.merchant} · {formatAmount(a.amount, currency)} (
                      {a.multiple.toFixed(1)}x vs ~{formatAmount(a.avg, currency)})
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="px-1 text-[11.5px] text-ink-faint">
        Updates as documents are processed. A calm reference, not a closed book.
      </p>
    </div>
  );
}

/* ----- pieces ------------------------------------------------------------ */

function RatioCard({
  label,
  value,
  tint,
}: {
  label: string;
  value: string;
  tint?: string;
}) {
  return (
    <li className="rounded-2xl border border-line bg-surface-raised p-4">
      <p className="text-[11px] uppercase tracking-[0.10em] text-ink-faint">
        {label}
      </p>
      <p
        className={`mt-1 text-[22px] font-semibold tracking-tight ${
          tint ?? "text-ink"
        }`}
      >
        {value}
      </p>
    </li>
  );
}

function FlowsChart({
  months,
}: {
  months: AnalysisAggregates["months"];
}) {
  const W = 480;
  const H = 160;
  const padX = 24;
  const padY = 16;
  const all = months.flatMap((m) => [m.inflow, m.outflow]);
  const max = Math.max(...all, 1);
  const x = (i: number) =>
    padX + (i * (W - 2 * padX)) / Math.max(1, months.length - 1);
  const y = (v: number) => H - padY - (v / max) * (H - 2 * padY);
  const path = (key: "inflow" | "outflow") =>
    months
      .map((m, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(m[key])}`)
      .join(" ");
  const hasInflow = months.some((m) => m.inflow > 0);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-[160px] w-full"
      preserveAspectRatio="none"
      aria-label="Revenue versus expenses by month"
    >
      {[0.25, 0.5, 0.75].map((p) => (
        <line
          key={p}
          x1={padX}
          x2={W - padX}
          y1={H - padY - p * (H - 2 * padY)}
          y2={H - padY - p * (H - 2 * padY)}
          stroke="rgba(28, 26, 23, 0.06)"
          strokeWidth={1}
        />
      ))}
      <path
        d={path("outflow")}
        stroke="var(--accent)"
        strokeWidth={1.75}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {hasInflow ? (
        <path
          d={path("inflow")}
          stroke="var(--ink)"
          strokeWidth={1.75}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {months.map((m, i) => (
        <text
          key={m.key}
          x={x(i)}
          y={H - 2}
          textAnchor="middle"
          fontSize={10}
          fill="rgba(28, 26, 23, 0.45)"
        >
          {m.label}
        </text>
      ))}
    </svg>
  );
}

function MerchantBars({
  rows,
}: {
  rows: AnalysisAggregates["topMerchants"];
}) {
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.merchant}>
          <div className="mb-1 flex items-baseline justify-between">
            <p className="truncate text-[12.5px] text-ink-soft">{r.merchant}</p>
            <p className="text-[12px] text-ink-muted">
              {formatAmount(r.total, r.currency)}
            </p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-canvas">
            <div
              className="h-full bg-accent"
              style={{ width: `${(r.total / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function LegendDot({ tint, label }: { tint: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-muted">
      <span className={`inline-block h-2 w-2 rounded-full ${tint}`} />
      {label}
    </span>
  );
}

function formatAmount(value: number, currency: string | null): string {
  const v = Math.round(value);
  const formatted = Math.abs(v).toLocaleString();
  const sign = v < 0 ? "-" : "";
  return currency ? `${sign}${formatted} ${currency}` : `${sign}${formatted}`;
}

function formatAmountTight(value: number, currency: string | null): string {
  const v = Math.round(value);
  return currency
    ? `${v.toLocaleString()} ${currency}`
    : v.toLocaleString();
}
