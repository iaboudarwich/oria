import { Topbar } from "@/components/dashboard/topbar";
import { Dropzone } from "@/components/upload/dropzone";
import { WorkFeed } from "@/components/work/work-feed";
import { listWorkInvoices } from "@/lib/data/work";

export const metadata = { title: "Invoices" };

export default async function WorkInvoicesPage() {
  const items = await listWorkInvoices({ limit: 100 });

  return (
    <>
      <Topbar title="Invoices" />

      <div className="mb-6 max-w-xl px-1 text-[13px] text-ink-muted">
        Incoming and outgoing invoices for this work space.
      </div>

      <div className="space-y-8 animate-fade-up">
        <section>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
            Add an invoice
          </h2>
          <Dropzone
            heading="Drop an invoice"
            subheading="Add a short note for context (vendor, project). Click to browse."
          />
        </section>

        <section>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
            All invoices
          </h2>
          <WorkFeed
            items={items}
            emptyTitle="No invoices yet."
            emptyHint="Drop invoices above. Oria pulls vendor, amount, due date, and currency so you can ask about totals, late payments, and missing matches."
          />
        </section>
      </div>
    </>
  );
}
