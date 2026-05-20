import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { LiveSearch } from "@/components/search/live-search";

export const metadata = { title: "Search" };

type Props = {
  searchParams: Promise<{ q?: string }>;
};

const presets = [
  "Find old receipts",
  "Where is my insurance policy",
  "Last year's tax forms",
  "Past trips",
  "School documents",
  "Recent appointments",
];

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const initialQuery = q?.trim() ?? "";

  return (
    <>
      <Topbar title="Search" />

      <div className="mx-auto max-w-2xl py-8 animate-fade-up">
        <LiveSearch
          variant="inline"
          autoFocus
          initialQuery={initialQuery}
        />

        {initialQuery ? null : (
          <>
            <p className="mt-5 px-1 text-[12.5px] text-ink-faint">
              Old or recent, it&apos;s all here.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <Link
                  key={p}
                  href={`/dashboard/search?q=${encodeURIComponent(p)}`}
                  className="inline-flex items-center rounded-lg px-2.5 py-1 text-[12.5px] text-ink-soft transition-base hover:bg-surface-raised hover:text-ink"
                >
                  {p}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
