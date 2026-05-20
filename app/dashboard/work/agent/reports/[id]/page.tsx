import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/dashboard/topbar";
import { ReportChartView } from "@/components/work/report-chart";
import { getWorkspaceReport } from "@/lib/data/workspace-reports";
import { deleteWorkspaceReport } from "@/lib/data/workspace-report-actions";

export const metadata = { title: "Report" };

type Props = { params: Promise<{ id: string }> };

export default async function ReportPage({ params }: Props) {
  const { id } = await params;
  const report = await getWorkspaceReport(id);
  if (!report) notFound();

  return (
    <>
      <Topbar title={report.title} />

      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/dashboard/work/agent"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-ink-muted transition-base hover:bg-surface-raised hover:text-ink"
        >
          <span className="-ml-0.5">←</span> Back to AI
        </Link>
        <span
          className={`ml-1 inline-flex h-5 items-center rounded-md px-1.5 text-[10.5px] ${
            report.status === "ready"
              ? "bg-sage/15 text-[#3f5240]"
              : report.status === "failed"
                ? "bg-claret/10 text-claret"
                : "bg-accent-soft/60 text-[#7a5a2a]"
          }`}
        >
          {report.status === "ready"
            ? "Ready"
            : report.status === "failed"
              ? "Failed"
              : "Generating"}
        </span>
        <span className="ml-2 text-[11.5px] text-ink-faint">
          {new Date(report.created_at).toLocaleString()}
        </span>
      </div>

      {report.status === "pending" ? (
        <div className="rounded-2xl border border-line bg-surface-raised p-6">
          <p className="text-[13.5px] text-ink">
            Oria is generating this report.
          </p>
          <p className="mt-1 text-[12px] text-ink-faint">
            This usually takes 10 to 30 seconds. Refresh the page to check.
          </p>
        </div>
      ) : null}

      {report.status === "failed" ? (
        <div className="rounded-2xl border border-line bg-surface-raised p-6">
          <p className="text-[13.5px] text-ink">
            The report didn&apos;t generate.
          </p>
          <p className="mt-1 text-[12px] text-ink-muted">
            {report.error_message ?? "Try again with a different brief."}
          </p>
        </div>
      ) : null}

      {report.status === "ready" && report.payload ? (
        <article className="animate-fade-up space-y-7">
          <section className="rounded-2xl border border-line bg-surface-raised p-5">
            <p className="text-[13.5px] leading-[1.55] text-ink">
              {report.payload.summary}
            </p>
            {report.payload.key_metrics && report.payload.key_metrics.length > 0 ? (
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {report.payload.key_metrics.map((m, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-line bg-canvas/40 p-3"
                  >
                    <p className="text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">
                      {m.label}
                    </p>
                    <p className="mt-1 text-[18px] font-semibold tracking-tight text-ink">
                      {m.value}
                    </p>
                    {m.delta ? (
                      <p className="mt-0.5 text-[11.5px] text-ink-muted">
                        {m.delta}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {report.payload.sections.map((s, i) => (
            <section key={i}>
              <h2 className="mb-2 px-1 text-[13px] font-medium text-ink-muted">
                {s.heading}
              </h2>
              <div className="space-y-3 rounded-2xl border border-line bg-surface-raised p-5">
                {s.body ? (
                  <p className="whitespace-pre-wrap text-[13.5px] leading-[1.55] text-ink">
                    {s.body}
                  </p>
                ) : null}
                {s.bullets && s.bullets.length > 0 ? (
                  <ul className="space-y-1.5">
                    {s.bullets.map((b, bi) => (
                      <li
                        key={bi}
                        className="flex items-start gap-2 text-[13px] text-ink"
                      >
                        <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {s.chart ? <ReportChartView chart={s.chart} /> : null}
              </div>
            </section>
          ))}
        </article>
      ) : null}

      <details className="mt-12 max-w-md border-t border-line pt-6">
        <summary className="cursor-pointer text-[12.5px] text-ink-faint transition-base hover:text-claret">
          Delete this report
        </summary>
        <form action={deleteWorkspaceReport} className="mt-3">
          <input type="hidden" name="id" value={report.id} />
          <button
            type="submit"
            className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-claret px-3.5 text-[12.5px] text-surface transition-base hover:opacity-90"
          >
            Delete
          </button>
        </form>
      </details>
    </>
  );
}
