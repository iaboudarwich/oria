import Link from "next/link";
import { CalendarIcon, DocumentIcon, SparkIcon } from "@/components/ui/icon";

export type SourceItem = {
  id: number;
  kind: "upload" | "reminder" | "memory" | "cloud_file";
  title: string;
  snippet: string;
  href: string;
  processing_state?: "ready" | "pending";
  meta: {
    section_label: string | null;
    space_name: string;
    date_label: string | null;
  };
};

/**
 * Compact source card. Click to jump to the underlying upload, calendar
 * item, or section memory. Numbered chip on the left matches the [N]
 * citations in the answer. A small "Reading…" chip appears on pending
 * uploads so the user understands why the answer hedges.
 */
export function SourceCard({ source }: { source: SourceItem }) {
  const Icon =
    source.kind === "memory"
      ? SparkIcon
      : source.kind === "upload" || source.kind === "cloud_file"
        ? DocumentIcon
        : CalendarIcon;
  const isPending = source.processing_state === "pending";
  const isMemory = source.kind === "memory";
  return (
    <Link
      href={source.href}
      className="group transition-base flex items-start gap-3 rounded-xl border border-line bg-surface-raised px-3.5 py-2.5 hover:border-line-strong hover:bg-canvas/40"
    >
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-canvas text-[10.5px] font-medium text-ink-muted">
        {source.id}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[13px] text-ink">
          <Icon size={12} />
          <span className="truncate">{source.title}</span>
          {isMemory ? (
            <span className="ml-1 inline-flex shrink-0 items-center rounded-md bg-accent-soft/60 px-1.5 py-0.5 text-[10px] text-[#7a5a2a]">
              Memory
            </span>
          ) : null}
          {isPending ? (
            <span className="ml-1 inline-flex shrink-0 items-center rounded-md bg-accent-soft/60 px-1.5 py-0.5 text-[10px] text-[#7a5a2a]">
              Reading…
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-ink-faint">
          {[source.meta.section_label, source.meta.date_label].filter(Boolean).join(" · ")}
        </p>
      </div>
      {/* Source-space chip on the right. Always shown so the user can
          tell at a glance which scope an answer is grounded in. the
          most important attribution in a cross-space search. */}
      <span className="ml-2 inline-flex shrink-0 items-center self-start rounded-md border border-line bg-canvas px-1.5 py-0.5 text-[10.5px] text-ink-muted">
        {source.meta.space_name}
      </span>
    </Link>
  );
}
