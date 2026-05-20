import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/icon";

export const metadata = { title: "Demo" };

const ROLES = [
  {
    id: "principal",
    label: "Principal",
    blurb: "Quiet overview of what needs your eye today.",
  },
  {
    id: "assistant",
    label: "Assistant",
    blurb: "Coordinate threads, follow-ups, and a real day's diary.",
  },
  {
    id: "accountant",
    label: "Accountant",
    blurb: "Books, reconciliation progress, and exceptions.",
  },
  {
    id: "staff",
    label: "Staff",
    blurb: "A simple task list and quick expense submit.",
  },
  {
    id: "household",
    label: "Household",
    blurb: "A shared, gentle view across the family.",
  },
  {
    id: "external",
    label: "External",
    blurb: "A scoped workspace for a single contributor.",
  },
];

export default function DemoIndex() {
  return (
    <>
      <header className="mb-8 max-w-2xl">
        <p className="text-[12px] uppercase tracking-[0.14em] text-ink-faint">
          Explore
        </p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-ink sm:text-[30px]">
          Six example workspaces.
        </h1>
        <p className="mt-2 text-[14px] text-ink-muted">
          Each one shows how Oria might feel for a different kind of user.
          The data is illustrative. Your own account starts empty.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map((r) => (
          <Link
            key={r.id}
            href={`/demo/${r.id}`}
            className="group flex flex-col rounded-xl border border-line bg-surface-raised p-5 transition-base hover:border-line-strong hover:bg-canvas/40"
          >
            <p className="text-[14px] font-semibold text-ink">{r.label}</p>
            <p className="mt-1 flex-1 text-[12.5px] text-ink-muted">{r.blurb}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-[12px] text-ink-soft group-hover:text-ink transition-base">
              Open <ArrowRightIcon size={11} />
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
