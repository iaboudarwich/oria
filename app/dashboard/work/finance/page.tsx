import { Topbar } from "@/components/dashboard/topbar";
import { Dropzone } from "@/components/upload/dropzone";
import { WorkFeed } from "@/components/work/work-feed";
import { listWorkFinance } from "@/lib/data/work";

export const metadata = { title: "Finance" };

export default async function WorkFinancePage() {
  const items = await listWorkFinance({ limit: 100 });

  return (
    <>
      <Topbar title="Finance" />

      <div className="mb-6 max-w-xl px-1 text-[13px] text-ink-muted">
        Payments, receivables, and account activity for this work space.
      </div>

      <div className="space-y-8 animate-fade-up">
        <section>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
            Add a financial document
          </h2>
          <Dropzone
            heading="Drop a statement, payment, or transfer"
            subheading="Add a short note for context. Click to browse."
          />
        </section>

        <section>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
            Recent activity
          </h2>
          <WorkFeed
            items={items}
            emptyTitle="No financial documents yet."
            emptyHint="Drop a statement, invoice, or receipt above. Oria pulls vendor, amount, currency, and date so you can ask about cash flow."
          />
        </section>
      </div>
    </>
  );
}
