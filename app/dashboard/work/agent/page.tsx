import Link from "next/link";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/dashboard/topbar";
import { ContextEditor } from "@/components/work/context-editor";
import { GenerateReportForm } from "@/components/work/generate-report";
import { ReportPoller } from "@/components/work/report-poller";
import { WorkAgentChat } from "@/components/work/work-agent-chat";
import { ChartIcon } from "@/components/ui/icon";
import { getCurrentContext } from "@/lib/data/organizations";
import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { listWorkspaceReports } from "@/lib/data/workspace-reports";

export const metadata = { title: "Work AI" };

const DEFAULT_SUGGESTIONS = [
  "Which leases expire in the next 90 days?",
  "What are our highest recurring expenses?",
  "Compare parking revenue vs maintenance costs.",
  "Forecast next quarter utilities.",
  "Summarize all vendor invoices this month.",
];

export default async function WorkAgentPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");
  if (ctx.organization.kind !== "office") {
    // Personal/Circle contexts don't have a Work AI. Send them to Work
    // setup if they have no workspace, else to the Work home where the
    // mode toggle will lead them in.
    redirect("/dashboard/work");
  }

  const [workspaceContext, reports] = await Promise.all([
    getWorkspaceContext(),
    listWorkspaceReports(20),
  ]);

  const hasPendingReport = reports.some((r) => r.status === "pending");

  return (
    <>
      <Topbar title="AI Agent" />
      <ReportPoller pending={hasPendingReport} />

      <p className="mb-6 max-w-2xl px-1 text-[13px] text-ink-muted">
        Persistent operational AI for this Workspace. Knows your standing
        context, reads everything you&apos;ve uploaded here, generates the
        reports a careful analyst would.
      </p>

      <div className="grid gap-6 lg:grid-cols-3 animate-fade-up">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border border-line bg-surface-raised p-4">
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
                Chat
              </h2>
              <span className="text-[11.5px] text-ink-faint">
                Scoped to {ctx.organization.name}
              </span>
            </div>
            <WorkAgentChat suggestions={DEFAULT_SUGGESTIONS} />
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
                Reports
              </h2>
              <span className="text-[11.5px] text-ink-faint">
                {reports.length} {reports.length === 1 ? "report" : "reports"}
              </span>
            </div>
            <div className="rounded-2xl border border-line bg-surface-raised p-4">
              <GenerateReportForm />
            </div>
            <ul className="mt-3 space-y-2">
              {reports.length === 0 ? (
                <li className="rounded-xl border border-line bg-surface-raised px-4 py-3 text-[12.5px] text-ink-faint">
                  No reports yet. Type a brief above to generate one.
                </li>
              ) : (
                reports.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/dashboard/work/agent/reports/${r.id}`}
                      className="group flex items-start gap-3 rounded-xl border border-line bg-surface-raised px-4 py-3 transition-base hover:border-line-strong hover:bg-canvas/40"
                    >
                      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-canvas text-ink-soft">
                        <ChartIcon size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] text-ink">
                          {r.title}
                        </p>
                        <p className="mt-0.5 truncate text-[11.5px] text-ink-faint">
                          {r.kind} · {new Date(r.created_at).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`mt-1 inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10.5px] ${
                          r.status === "ready"
                            ? "bg-sage/15 text-[#3f5240]"
                            : r.status === "failed"
                              ? "bg-claret/10 text-claret"
                              : "bg-accent-soft/60 text-[#7a5a2a]"
                        }`}
                      >
                        {r.status === "ready"
                          ? "Ready"
                          : r.status === "failed"
                            ? "Failed"
                            : "Generating"}
                      </span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <ContextEditor context={workspaceContext} />
          <Suggestions />
        </aside>
      </div>
    </>
  );
}

function Suggestions() {
  const items = [
    "Set up Workspace context once — the AI uses it on every answer.",
    "Generate a monthly summary report on the 1st as your operating brief.",
    "Upload leases and invoices and ask the AI to flag anomalies.",
    "Invite analysts and accountants from the Members page.",
  ];
  return (
    <section>
      <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
        Suggested
      </h2>
      <ul className="space-y-1 rounded-2xl border border-line bg-surface-raised p-3">
        {items.map((t, i) => (
          <li
            key={i}
            className="rounded-md px-2 py-1.5 text-[12.5px] text-ink-muted"
          >
            · {t}
          </li>
        ))}
      </ul>
    </section>
  );
}
