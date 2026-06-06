import { getTranslations } from "next-intl/server";
import { TrendChart } from "@/components/ui/trend-chart";
import { Stack } from "@/components/ui/layout";
import { money } from "@/lib/sections/format";
import { summarizeSpend } from "@/lib/sections/spend-summary";
import type { BillItem } from "@/lib/data/smart-sections";
import type { Trackable, TrackablePeriod } from "@/lib/data/trackables";

// Categorical palette for the breakdown: spend (amber) leads, then the other
// data hues, so categories stay legible instead of a wall of amber. These are
// distinct labels, not status, so a multi-hue categorical use is correct here.
const CAT_COLORS = [
  "var(--spend)",
  "var(--sleep)",
  "var(--strain)",
  "var(--rec)",
  "var(--brand)",
  "var(--accent)",
  "var(--ink-faint)",
];

function periodSuffixKey(p: TrackablePeriod | null): string {
  switch (p) {
    case "monthly": return "per_monthly";
    case "quarterly": return "per_quarterly";
    case "semi_annually": return "per_semi_annually";
    case "annually": return "per_annually";
    default: return "per_once";
  }
}

/**
 * Bills "Spend" view, rebuilt on the design tokens (Round: premium redesign 2,
 * Part C). Real data only (memory_items bills + subscription trackables), every
 * number summed by the shared `summarizeSpend`:
 *   - spend over time as a 6-month / 12-month TrendChart,
 *   - a per-category breakdown as multi-color bars (legible, not all amber),
 *   - the subscriptions list (subscription trackables),
 *   - and the recent transactions, so the visuals drill into the real items.
 * Server-rendered; the only client island is TrendChart (no chart library).
 */
export async function BillsSpendView({
  bills,
  subscriptions,
}: {
  bills: BillItem[];
  subscriptions: Trackable[];
}) {
  const t = await getTranslations("bills");
  const summary = summarizeSpend(bills, new Date());
  const { categories, monthly, currency } = summary;
  const last6 = monthly.slice(-6);

  const transactions = bills
    .filter((b) => typeof b.amount_normalized === "number" && b.occurred_at)
    .slice(0, 12);

  return (
    <Stack gap={6}>
      <section>
        <h2 className="mb-2 px-1 text-eyebrow">{t("spend_over_time")}</h2>
        <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
          <TrendChart
            week={last6}
            month={monthly}
            kind="bar"
            weekLabel={t("lens_6mo")}
            monthLabel={t("lens_12mo")}
          />
        </div>
      </section>

      {categories.length > 0 ? (
        <section>
          <h2 className="mb-2 px-1 text-eyebrow">{t("by_category")}</h2>
          <Stack gap={3} className="rounded-card border border-line bg-surface p-4 shadow-soft">
            {categories.map((c, i) => {
              const color = CAT_COLORS[i % CAT_COLORS.length];
              return (
                <div key={c.label}>
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="truncate text-ink">{c.label}</span>
                    </span>
                    <span className="num shrink-0 font-medium text-ink">
                      {money(c.amount, currency)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(2, Math.round(c.share * 100))}%`,
                        background: color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </Stack>
        </section>
      ) : null}

      {subscriptions.length > 0 ? (
        <section>
          <h2 className="mb-2 px-1 text-eyebrow">{t("subscriptions")}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-soft">
            {subscriptions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-ink">
                    {s.title || s.vendor || "—"}
                  </span>
                  {s.renewal_date ? (
                    <span className="block text-[12px] text-ink-muted">
                      {t("renews", {
                        date: new Date(s.renewal_date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        }),
                      })}
                    </span>
                  ) : null}
                </span>
                {s.cost_amount != null ? (
                  <span className="num shrink-0 text-[14px] font-medium text-ink">
                    {money(s.cost_amount, s.cost_currency ?? currency)}
                    <span className="text-[11.5px] font-normal text-ink-faint">
                      {" "}
                      {t(periodSuffixKey(s.cost_period) as "per_monthly")}
                    </span>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {transactions.length > 0 ? (
        <section>
          <h2 className="mb-2 px-1 text-eyebrow">{t("transactions")}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-soft">
            {transactions.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-ink">
                    {b.merchant || b.title || "—"}
                  </span>
                  {b.occurred_at ? (
                    <span className="block text-[12px] text-ink-muted">
                      {new Date(b.occurred_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  ) : null}
                </span>
                <span className="num shrink-0 text-[14px] font-medium text-ink">
                  {money(b.amount_normalized as number, b.amount_currency ?? currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Stack>
  );
}
