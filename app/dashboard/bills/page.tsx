import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { DropzoneCompact } from "@/components/upload/dropzone-compact";
import { TextLogForm } from "@/components/section/text-log-form";
import { WalletIcon } from "@/components/ui/icon";
import { AskChat } from "@/components/ask/ask-chat";
import { SectionMemoryPanel } from "@/components/section/section-memory-panel";
import {
  listBills,
  summarizeRecurring,
  type BillItem,
  type RecurringSummary,
} from "@/lib/data/smart-sections";
import { listSectionMemories } from "@/lib/data/section-memory";
import { listRecentUserQuestions } from "@/lib/data/recent-questions";
import type { SectionScope } from "@/lib/data/section-scope";

export const metadata = { title: "Bills" };

const SCOPE: SectionScope = { kind: "smart", key: "bills", label: "Bills" };
const SUGGESTIONS = [
  "When is my next electricity bill?",
  "How much do I usually pay for electricity?",
  "Which bills are recurring?",
  "What payments are due this week?",
];

export default async function BillsPage() {
  const [bills, memories, recentQuestions] = await Promise.all([
    listBills(200),
    listSectionMemories(SCOPE),
    listRecentUserQuestions({ surface: "ask", scope: SCOPE, limit: 3 }),
  ]);
  const now = new Date();

  const upcoming = bills
    .filter((b) => b.occurred_at && new Date(b.occurred_at) >= now)
    .sort((a, b) =>
      (a.occurred_at ?? "").localeCompare(b.occurred_at ?? ""),
    );
  const recent = bills
    .filter((b) => b.occurred_at && new Date(b.occurred_at) < now)
    .slice(0, 12);
  const recurring = summarizeRecurring(bills);
  const forecast = forecastNextMonth(recurring);

  const empty = bills.length === 0;

  return (
    <>
      <Topbar title="Bills" />

      <div className="space-y-7 animate-fade-up">
        <DropzoneCompact
          smartSection="bills"
          heading="Drop a bill or invoice"
          subheading="add a short note, e.g. ‘Electricity for LA apartment’"
        />

        <TextLogForm
          smartSection="bills"
          placeholder="Or type a bill — ‘Rent $2,500 due June 1, monthly’"
          label="Log a bill by text"
        />

        <ForecastStrip forecast={forecast} />

        {empty ? (
          <p className="px-1 text-[13px] text-ink-faint">
            Your bills will appear here as you upload them.
          </p>
        ) : null}

        {upcoming.length > 0 ? (
          <section>
            <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
              Upcoming
            </h2>
            <ul className="rounded-2xl border border-line bg-surface-raised divide-y divide-line">
              {upcoming.map((b) => (
                <BillRow key={b.id} bill={b} kind="upcoming" />
              ))}
            </ul>
          </section>
        ) : null}

        {recurring.length > 0 ? (
          <section>
            <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
              Recurring
            </h2>
            <ul className="rounded-2xl border border-line bg-surface-raised divide-y divide-line">
              {recurring.map((r, i) => (
                <RecurringRow key={i} r={r} />
              ))}
            </ul>
          </section>
        ) : null}

        {recent.length > 0 ? (
          <section>
            <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
              Recent
            </h2>
            <ul className="rounded-2xl border border-line bg-surface-raised divide-y divide-line">
              {recent.map((b) => (
                <BillRow key={b.id} bill={b} kind="recent" />
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
            Ask Bills
          </h2>
          <div className="rounded-2xl border border-line bg-surface-raised p-3">
            <AskChat
              scope={SCOPE}
              suggestions={SUGGESTIONS}
              recentQuestions={recentQuestions}
            />
          </div>
        </section>

        <SectionMemoryPanel scope={SCOPE} memories={memories} />

        <p className="px-1 text-[11px] text-ink-faint">
          Forecasts are a calm reference, not a guarantee.
        </p>
      </div>
    </>
  );
}

/**
 * Horizontal forecast strip. Replaces the old vertical aside cards
 * (Forecast + Unusual) so the page lays out as one calm column instead
 * of a hero block + sidebar.
 */
function ForecastStrip({
  forecast,
}: {
  forecast: { total: number; currency: string | null } | null;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-2xl border border-line bg-surface-raised p-4">
      <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
        Next month
      </span>
      {forecast ? (
        <>
          <span className="text-[26px] font-semibold tracking-tight text-ink">
            {forecast.total.toLocaleString()}
          </span>
          {forecast.currency ? (
            <span className="text-[12.5px] text-ink-muted">
              {forecast.currency}
            </span>
          ) : null}
        </>
      ) : (
        <span className="text-[12.5px] text-ink-faint">
          Fills in once Oria sees a few recurring bills.
        </span>
      )}
    </div>
  );
}

function BillRow({
  bill: b,
  kind,
}: {
  bill: BillItem;
  kind: "upcoming" | "recent";
}) {
  const date = b.occurred_at ? new Date(b.occurred_at) : null;
  const dateLabel = date
    ? kind === "upcoming"
      ? `due ${friendlyRelative(date)}`
      : `paid ${friendlyDate(date)}`
    : null;
  const amount =
    b.amount_value !== null
      ? b.amount_currency
        ? `${b.amount_value} ${b.amount_currency}`
        : b.amount_value
      : null;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-canvas text-ink-soft">
        <WalletIcon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        {b.upload_id ? (
          <Link
            href={`/dashboard/uploads/${b.upload_id}`}
            className="truncate text-[13.5px] text-ink transition-base hover:text-ink-soft"
          >
            {b.merchant || b.title}
          </Link>
        ) : (
          <p className="truncate text-[13.5px] text-ink">
            {b.merchant || b.title}
          </p>
        )}
        <p className="truncate text-[11.5px] text-ink-faint">
          {b.location || b.category || b.summary || "·"}
        </p>
      </div>
      <div className="text-right">
        {amount ? <p className="text-[13px] text-ink">{amount}</p> : null}
        {dateLabel ? (
          <p className="text-[11px] text-ink-faint">{dateLabel}</p>
        ) : null}
      </div>
    </li>
  );
}

function RecurringRow({ r }: { r: RecurringSummary }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] text-ink">{r.merchant}</p>
        <p className="truncate text-[11.5px] text-ink-faint">
          {(r.interval ?? "recurring").toLowerCase()}
          {r.next_expected
            ? ` · next ${friendlyDate(new Date(r.next_expected))}`
            : ""}
          {r.count > 1 ? ` · ${r.count} seen` : ""}
        </p>
      </div>
      {r.average !== null ? (
        <p className="text-[12.5px] text-ink">
          ~{r.average.toLocaleString()} {r.currency ?? ""}
        </p>
      ) : null}
    </li>
  );
}

/* ----- helpers ----------------------------------------------------------- */

function forecastNextMonth(
  recurring: RecurringSummary[],
): { total: number; currency: string | null } | null {
  const items = recurring.filter((r) => r.average !== null);
  if (items.length === 0) return null;
  // Sum monthly contribution. Quarterly/yearly are amortised so the number
  // reads as "what you'll typically pay in a month".
  let total = 0;
  for (const r of items) {
    const a = r.average ?? 0;
    switch ((r.interval ?? "monthly").toLowerCase()) {
      case "weekly":
        total += a * 4;
        break;
      case "monthly":
        total += a;
        break;
      case "quarterly":
        total += a / 3;
        break;
      case "yearly":
        total += a / 12;
        break;
      default:
        total += a;
    }
  }
  // Pick the dominant currency (most-common among recurring items).
  const counts = new Map<string, number>();
  const NONE = "__none__";
  for (const r of items) {
    const c = r.currency ?? NONE;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const currency = sorted[0]?.[0] === NONE ? null : sorted[0]?.[0] ?? null;
  return { total: Math.round(total), currency };
}

function friendlyDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function friendlyRelative(d: Date): string {
  const ms = d.getTime() - Date.now();
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "in 1 day";
  if (days < 14) return `in ${days} days`;
  return `on ${friendlyDate(d)}`;
}
