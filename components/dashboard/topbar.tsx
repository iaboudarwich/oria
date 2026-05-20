import { BellIcon, SearchIcon } from "@/components/ui/icon";

type TopbarProps = {
  title: string;
  subtitle?: string;
};

export function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 -mx-6 mb-6 border-b border-line bg-canvas/85 px-6 pt-5 pb-4 backdrop-blur sm:-mx-10 sm:px-10">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 pl-12 lg:pl-0">
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
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-raised text-ink-muted transition-base hover:text-ink hover:border-line-strong"
            aria-label="Search"
          >
            <SearchIcon />
          </a>
          <button
            type="button"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-raised text-ink-muted transition-base hover:text-ink hover:border-line-strong"
            aria-label="Notifications"
          >
            <BellIcon />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent" />
          </button>
        </div>
      </div>
    </header>
  );
}
