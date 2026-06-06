import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Eyebrow } from "@/components/ui/eyebrow";
import { HeroNumber } from "@/components/ui/hero-number";
import type { NetWorth } from "@/lib/net-worth/compute";

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value).toLocaleString()} ${currency}`;
  }
}

/**
 * Today's net worth mini-card: the cross-account headline (Round 18), insight
 * led. One figure up front, a plain line under it, a tap into the full Net worth
 * surface for the contributors. Presentational; the page computes the figure
 * once and passes it in.
 */
export async function NetWorthMiniCard({ nw }: { nw: NetWorth }) {
  const t = await getTranslations("dashboardCards");
  return (
    <Link
      href="/dashboard/net-worth"
      className="transition-base block rounded-2xl border border-line bg-surface-raised p-4 hover:border-ink/20"
    >
      <Eyebrow>{t("net_worth_eyebrow")}</Eyebrow>
      <div className="mt-1">
        <HeroNumber value={money(nw.netWorth, nw.currency)} label={t("net_worth_label")} />
      </div>
      <p className="mt-1.5 text-[12.5px] text-ink-muted">
        {nw.totalLiabilities > 0
          ? t("net_worth_insight", {
              assets: money(nw.totalAssets, nw.currency),
              debts: money(nw.totalLiabilities, nw.currency),
            })
          : t("net_worth_tap")}
      </p>
    </Link>
  );
}
