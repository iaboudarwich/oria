import { Topbar } from "@/components/dashboard/topbar";
import { Dropzone } from "@/components/upload/dropzone";
import { WorkFeed } from "@/components/work/work-feed";
import { listWorkContracts } from "@/lib/data/work";

export const metadata = { title: "Contracts" };

export default async function WorkContractsPage() {
  const items = await listWorkContracts({ limit: 100 });

  return (
    <>
      <Topbar title="Contracts" />

      <div className="mb-6 max-w-xl px-1 text-[13px] text-ink-muted">
        Agreements, leases, terms, and signed documents.
      </div>

      <div className="space-y-8 animate-fade-up">
        <section>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
            Add a contract
          </h2>
          <Dropzone
            heading="Drop a contract or agreement"
            subheading="Add a short note for context. Click to browse."
          />
        </section>

        <section>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
            Library
          </h2>
          <WorkFeed
            items={items}
            emptyTitle="No contracts yet."
            emptyHint="Drop a contract, NDA, lease, or term sheet above. Oria pulls parties, dates, valuations, and key terms."
          />
        </section>
      </div>
    </>
  );
}
