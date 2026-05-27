import Link from "next/link";
import { DocumentIcon, ScalesIcon, WalletIcon } from "@/components/ui/icon";
import type { WorkFeedItem } from "@/lib/data/work";

const ICON_FOR_DOC_TYPE: Record<string, React.ComponentType<{ size?: number }>> = {
  invoice: DocumentIcon,
  receipt: WalletIcon,
  contract: ScalesIcon,
};

/**
 * Calm list of memory_items for a Work feed page. Used by Finance,
 * Contracts, and Invoices. Empty state encourages the user to upload.
 */
export function WorkFeed({
  items,
  emptyTitle,
  emptyHint,
}: {
  items: WorkFeedItem[];
  emptyTitle: string;
  emptyHint: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface-raised p-5">
        <p className="text-[13px] text-ink">{emptyTitle}</p>
        <p className="mt-1 text-[12.5px] text-ink-faint">{emptyHint}</p>
      </div>
    );
  }
  return (
    <ul className="rounded-2xl border border-line bg-surface-raised divide-y divide-line">
      {items.map((it) => (
        <FeedRow key={it.id} item={it} />
      ))}
    </ul>
  );
}

function FeedRow({ item: it }: { item: WorkFeedItem }) {
  const Icon =
    (it.document_type && ICON_FOR_DOC_TYPE[it.document_type]) ?? DocumentIcon;
  const amount =
    it.amount_value !== null
      ? it.amount_currency
        ? `${it.amount_value} ${it.amount_currency}`
        : it.amount_value
      : null;
  const date = it.occurred_at
    ? new Date(it.occurred_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-canvas text-ink-soft">
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        {it.upload_id ? (
          <Link
            href={`/dashboard/uploads/${it.upload_id}`}
            className="block truncate text-[13.5px] text-ink transition-base hover:text-ink-soft"
          >
            {it.merchant || it.title}
          </Link>
        ) : (
          <p className="truncate text-[13.5px] text-ink">
            {it.merchant || it.title}
          </p>
        )}
        <p className="truncate text-[11.5px] text-ink-faint">
          {[it.location, it.category, it.summary].filter(Boolean).join(" · ") ||
            it.title}
        </p>
      </div>
      <div className="text-right">
        {amount ? <p className="text-[13px] text-ink">{amount}</p> : null}
        {date ? <p className="text-[11px] text-ink-faint">{date}</p> : null}
      </div>
    </li>
  );
}
