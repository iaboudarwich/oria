import { Topbar } from "@/components/dashboard/topbar";

export const metadata = { title: "Reports" };

const REPORT_CARDS = [
  {
    title: "Monthly summary",
    body: "Revenue, expenses, key ratios, and notable items. Generated on the first of every month.",
  },
  {
    title: "Quarterly review",
    body: "Three-month trend, forecast accuracy, anomalies, and cost drivers.",
  },
  {
    title: "Custom report",
    body: "Ask Oria to summarize a specific period, vendor, or property.",
  },
];

export default function WorkReportsPage() {
  return (
    <>
      <Topbar title="Reports" />

      <div className="mb-6 max-w-xl px-1 text-[13px] text-ink-muted">
        Executive summaries Oria writes from your uploads.
      </div>

      <div className="animate-fade-up space-y-8">
        <section>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {REPORT_CARDS.map((r) => (
              <li key={r.title} className="rounded-2xl border border-line bg-surface-raised p-4">
                <p className="text-[13.5px] text-ink">{r.title}</p>
                <p className="mt-1 text-[12px] text-ink-faint">{r.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">Latest</h2>
          <div className="rounded-2xl border border-line bg-surface-raised p-5">
            <p className="text-[12.5px] text-ink-faint">
              Reports will appear here once Oria has enough context. Upload a few months of invoices
              and statements to get started.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
