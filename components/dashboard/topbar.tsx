import { SearchIcon } from "@/components/ui/icon";
import { getCurrentContext } from "@/lib/data/organizations";
import { StatusStrip } from "./status-strip";

type TopbarProps = {
  title: string;
  subtitle?: string;
};

/**
 * Page chrome. A thin eyebrow above the title names the active space —
 * "Personal", "Office Building A", "Family" — so the user never loses
 * their grounding when bouncing between Workspaces and Circles.
 * Topbar is async because it reads getCurrentContext, which is cached
 * by React for the duration of the render so this is free in practice.
 */
export async function Topbar({ title, subtitle }: TopbarProps) {
  const ctx = await getCurrentContext();
  const spaceName = ctx?.organization.name ?? null;
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-6 border-b border-line bg-canvas/85 px-4 pt-safe pt-4 pb-3 backdrop-blur sm:-mx-6 sm:px-6 sm:pt-5 sm:pb-4 lg:-mx-10 lg:px-10">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 pl-12 lg:pl-0">
          {spaceName ? (
            <p className="truncate text-[11.5px] text-ink-faint">
              <span className="text-ink-muted">{spaceName}</span>
              <span className="mx-1.5 text-ink-faint">›</span>
              <span>{title}</span>
            </p>
          ) : null}
          <h1 className="text-[20px] font-semibold tracking-tight text-ink sm:text-[22px]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 text-[13px] text-ink-muted">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/dashboard/search"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface-raised text-ink-muted transition-base hover:text-ink hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            aria-label="Search"
          >
            <SearchIcon />
          </a>
        </div>
      </div>
      <StatusStrip />
    </header>
  );
}
