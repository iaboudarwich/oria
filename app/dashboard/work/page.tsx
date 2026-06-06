import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { DropzoneCompact } from "@/components/upload/dropzone-compact";
import { SearchHero } from "@/components/dashboard/search-hero";
import {
  CalendarIcon,
  ChartIcon,
  DocumentIcon,
  PulseIcon,
  ScalesIcon,
  WalletIcon,
} from "@/components/ui/icon";
import { getCurrentContext } from "@/lib/data/organizations";

export const metadata = { title: "Work" };

const TILES = [
  {
    label: "Analysis",
    href: "/dashboard/work/analysis",
    icon: ChartIcon,
    hint: "Revenue, costs, trends, forecasts.",
  },
  {
    label: "Finance",
    href: "/dashboard/work/finance",
    icon: WalletIcon,
    hint: "Payments, receivables, account activity.",
  },
  {
    label: "Contracts",
    href: "/dashboard/work/contracts",
    icon: ScalesIcon,
    hint: "Agreements, leases, terms.",
  },
  {
    label: "Invoices",
    href: "/dashboard/work/invoices",
    icon: DocumentIcon,
    hint: "Incoming and outgoing.",
  },
  {
    label: "Calendar",
    href: "/dashboard/calendar",
    icon: CalendarIcon,
    hint: "Payments due, deadlines, filings.",
  },
  {
    label: "Reports",
    href: "/dashboard/work/reports",
    icon: PulseIcon,
    hint: "Quarterly summaries, generated views.",
  },
];

export default async function WorkHome() {
  const ctx = await getCurrentContext();
  const spaceName = ctx?.organization.name ?? "Work";

  return (
    <>
      <Topbar title={spaceName} />

      <div className="mb-6 px-1 text-[13px] text-ink-muted">
        Your operational memory for {spaceName}. Drop in invoices, contracts, and statements. Ask
        anything.
      </div>

      <div className="animate-fade-up space-y-9">
        <SearchHero />

        <section>
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-[13px] font-medium text-ink-muted">Add to Oria</h2>
            <Link
              href="/dashboard/inbox"
              className="transition-base text-[12px] text-ink-faint hover:text-ink"
            >
              Open upload page
            </Link>
          </div>
          <DropzoneCompact />
        </section>

        <section>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">Work areas</h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TILES.map((t) => (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className="group transition-base flex h-full items-start gap-3 rounded-2xl border border-line bg-surface-raised p-4 hover:border-line-strong hover:bg-canvas/40"
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-canvas text-ink-soft">
                    <t.icon size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] text-ink">{t.label}</p>
                    <p className="mt-0.5 text-[11.5px] text-ink-faint">{t.hint}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
