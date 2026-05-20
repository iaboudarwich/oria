import { Topbar } from "@/components/dashboard/topbar";
import { Dropzone } from "@/components/upload/dropzone";
import { SparkIcon, WalletIcon } from "@/components/ui/icon";

export const metadata = { title: "Bills" };

// Placeholder data — wired to real extractions in a follow-up.
const UPCOMING = [
  {
    name: "Con Edison electricity",
    location: "LA apartment",
    due_in_days: 4,
    amount: 184,
    currency: "USD",
  },
  {
    name: "Spectrum internet",
    location: "LA apartment",
    due_in_days: 9,
    amount: 65,
    currency: "USD",
  },
  {
    name: "Rent",
    location: "Monaco summer house",
    due_in_days: 14,
    amount: 3200,
    currency: "EUR",
  },
];

const RECURRING = [
  { name: "Electricity (LA)", cadence: "Monthly", average: 178, currency: "USD" },
  { name: "Internet (LA)", cadence: "Monthly", average: 65, currency: "USD" },
  { name: "Rent (Monaco)", cadence: "Monthly", average: 3200, currency: "EUR" },
  { name: "AICO maintenance", cadence: "Quarterly", average: 240, currency: "USD" },
  { name: "Phone (Verizon)", cadence: "Monthly", average: 92, currency: "USD" },
];

const RECENT = [
  { name: "Con Edison electricity", paid_on: "Mar 28", amount: 172, currency: "USD" },
  { name: "Spectrum internet", paid_on: "Mar 21", amount: 65, currency: "USD" },
  { name: "Rent (Monaco)", paid_on: "Mar 1", amount: 3200, currency: "EUR" },
  { name: "Whish Money transfer", paid_on: "Feb 26", amount: 450, currency: "USD" },
];

const FORECAST_NEXT_MONTH = {
  total: 3915,
  currency: "USD",
  vs_last_month: -2.1, // %
};

export default function BillsPage() {
  return (
    <>
      <Topbar title="Bills" />

      <div className="mb-6 flex items-center gap-2 px-1">
        <SmartBadge />
        <p className="text-[12.5px] text-ink-faint">
          Upload bills as they arrive. Oria tracks the recurring ones and
          forecasts what&apos;s next.
        </p>
      </div>

      <div className="space-y-9 animate-fade-up">
        <section>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
            Add a bill
          </h2>
          <Dropzone
            heading="Drop a bill or invoice"
            subheading="Add a short note (e.g. ‘Electricity bill for LA apartment’). Click to browse."
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
              Upcoming
            </h2>
            <ul className="rounded-2xl border border-line bg-surface-raised divide-y divide-line">
              {UPCOMING.map((b, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-canvas text-ink-soft">
                    <WalletIcon size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] text-ink">{b.name}</p>
                    <p className="truncate text-[11.5px] text-ink-faint">
                      {b.location}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] text-ink">
                      {b.amount.toLocaleString()} {b.currency}
                    </p>
                    <p className="text-[11px] text-ink-faint">
                      due in {b.due_in_days} {b.due_in_days === 1 ? "day" : "days"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <aside className="space-y-6">
            <ForecastCard f={FORECAST_NEXT_MONTH} />
            <UnusualCard />
          </aside>
        </div>

        <section>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
            Recurring
          </h2>
          <ul className="rounded-2xl border border-line bg-surface-raised divide-y divide-line">
            {RECURRING.map((r, i) => (
              <li
                key={i}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] text-ink">{r.name}</p>
                  <p className="truncate text-[11.5px] text-ink-faint">
                    {r.cadence}
                  </p>
                </div>
                <p className="text-[12.5px] text-ink">
                  ~{r.average.toLocaleString()} {r.currency}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
            Recent
          </h2>
          <ul className="rounded-2xl border border-line bg-surface-raised divide-y divide-line">
            {RECENT.map((r, i) => (
              <li
                key={i}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] text-ink">{r.name}</p>
                  <p className="truncate text-[11.5px] text-ink-faint">
                    paid {r.paid_on}
                  </p>
                </div>
                <p className="text-[12.5px] text-ink-soft">
                  {r.amount.toLocaleString()} {r.currency}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <p className="px-1 text-[11.5px] text-ink-faint">
          Forecasts are based on your recent uploads. Treat them as a calm
          reference, not a guarantee.
        </p>
      </div>
    </>
  );
}

function ForecastCard({
  f,
}: {
  f: { total: number; currency: string; vs_last_month: number };
}) {
  const lower = f.vs_last_month <= 0;
  return (
    <section>
      <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
        Next month forecast
      </h2>
      <div className="rounded-2xl border border-line bg-surface-raised p-5">
        <p className="text-[11.5px] uppercase tracking-[0.12em] text-ink-faint">
          Estimated total
        </p>
        <p className="mt-1 text-[28px] font-semibold tracking-tight text-ink">
          {f.total.toLocaleString()}{" "}
          <span className="text-[14px] font-medium text-ink-muted">
            {f.currency}
          </span>
        </p>
        <p className={`mt-1 text-[12px] ${lower ? "text-sage" : "text-claret"}`}>
          {lower ? "↓" : "↑"} {Math.abs(f.vs_last_month).toFixed(1)}% vs last
          month
        </p>
      </div>
    </section>
  );
}

function UnusualCard() {
  return (
    <section>
      <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
        Unusual charges
      </h2>
      <div className="rounded-2xl border border-line bg-surface-raised p-5">
        <p className="text-[12.5px] text-ink-faint">
          Nothing flagged. Oria will surface anything that&apos;s noticeably
          higher than usual.
        </p>
      </div>
    </section>
  );
}

function SmartBadge() {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-full bg-accent-soft/60 px-2 text-[10.5px] font-medium text-[#7a5a2a]">
      <SparkIcon size={10} /> Smart Section
    </span>
  );
}
