import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ScoreRing } from "@/components/ui/score-ring";
import { DATA_VAR, DATA_TRACK } from "@/lib/ui/status-color";
import { money } from "@/lib/sections/format";
import type { SpendSummary } from "@/lib/sections/spend-summary";

/**
 * Home "Spending" ring tile. The arc shows this month's spend as a fraction of
 * last month's (so a full ring means "you've already matched last month"); the
 * headline is the real amount and a month-over-month trend pill. There is no
 * budget in the data, so the honest reference point is last month, not an
 * invented target. Spending LESS than last month reads as good (up tone, green);
 * more reads as attention (down tone). Taps into the spend breakdown +
 * transactions. Rendered only when there is real spend (summary.hasData).
 */
export async function SpendMiniCard({
  summary,
  monthLabel,
}: {
  summary: SpendSummary;
  monthLabel: string;
}) {
  const t = await getTranslations("dashboardCards");
  const { thisMonth, lastMonth, deltaPct, currency } = summary;

  // Arc: this month against last month, capped. With no last month, fill it.
  const pct = lastMonth > 0 ? Math.round((thisMonth / lastMonth) * 100) : null;
  const arc = pct != null ? Math.min(100, pct) : thisMonth > 0 ? 100 : 0;

  const improved = deltaPct != null && deltaPct <= 0; // spent same-or-less = good
  const arrow = deltaPct != null && deltaPct > 0 ? "↑" : "↓";

  return (
    <Link
      href="/dashboard/bills?view=spend"
      className="transition-base block rounded-card border border-line bg-surface p-4 shadow-soft hover:border-ink/20"
    >
      <Eyebrow>
        {t("card_spend")} · {monthLabel}
      </Eyebrow>
      <div className="mt-2.5 flex items-center gap-3.5">
        <ScoreRing
          score={arc}
          size={60}
          colorVar={DATA_VAR.spend}
          trackVar={DATA_TRACK.spend}
          ariaLabel={money(thisMonth, currency)}
          center={
            pct != null ? (
              <span className="num text-[13px] font-semibold text-ink">{pct}%</span>
            ) : (
              <span className="num text-[12px] font-semibold text-ink-muted">·</span>
            )
          }
        />
        <div className="min-w-0">
          <div className="num text-[19px] font-semibold text-ink">{money(thisMonth, currency)}</div>
          {lastMonth > 0 ? (
            <div className="text-[11.5px] text-ink-faint">
              {t("spend_vs_last", { amount: money(lastMonth, currency) })}
            </div>
          ) : null}
          {deltaPct != null ? (
            <span
              className="num mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                color: improved ? "var(--up)" : "var(--down)",
                background: improved ? "var(--rec-t)" : "rgba(242,104,92,0.14)",
              }}
            >
              {arrow} {Math.abs(deltaPct)}%
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
