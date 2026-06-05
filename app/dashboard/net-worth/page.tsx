import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/dashboard/topbar";
import { EmptyState } from "@/components/ui/empty-state";
import { WalletIcon } from "@/components/ui/icon";
import { GlassCard } from "@/components/ui/glass-card";
import { HeroNumber } from "@/components/ui/hero-number";
import { Eyebrow } from "@/components/ui/eyebrow";
import { AllocationDonut } from "@/components/finance/allocation-donut";
import { NetWorthChart, type NetWorthPoint } from "@/components/finance/net-worth-chart";
import { ManualAssetsPanel } from "@/components/finance/manual-assets-panel";
import {
  listManualAssets,
  currentNetWorth,
  listNetWorthSnapshots,
} from "@/lib/data/net-worth";
import { allocationSlices } from "@/lib/net-worth/compute";

export const metadata = { title: "Net worth" };
export const dynamic = "force-dynamic";

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

function shortDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function NetWorthPage() {
  const t = await getTranslations("netWorth");
  const [assets, nw, snapshots] = await Promise.all([
    listManualAssets(),
    currentNetWorth(),
    listNetWorthSnapshots(120),
  ]);

  const empty = assets.length === 0;
  const slices = allocationSlices(nw);

  // The line is the snapshot history plus a live "today" point so the current
  // figure always shows, even before the first overnight snapshot lands.
  const points: NetWorthPoint[] = snapshots.map((s) => ({
    date: s.snapshot_date,
    value: s.net_worth,
    label: shortDate(s.snapshot_date),
  }));
  const todayKey = new Date().toLocaleDateString("en-CA");
  if (points.length === 0 || points[points.length - 1].date !== todayKey) {
    points.push({ date: todayKey, value: nw.netWorth, label: t("now") });
  } else {
    points[points.length - 1] = { date: todayKey, value: nw.netWorth, label: t("now") };
  }

  return (
    <>
      <Topbar title={t("title")} />
      <div className="animate-fade-up space-y-6">
        {empty ? (
          <EmptyState
            icon={<WalletIcon size={22} />}
            headline={t("empty_headline")}
            description={t("empty_desc")}
          />
        ) : (
          <>
            <GlassCard>
              <Eyebrow>{t("title")}</Eyebrow>
              <div className="mt-1">
                <HeroNumber value={money(nw.netWorth, nw.currency)} label={t("net_worth")} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-muted">
                <span>
                  {t("assets")}: <span className="tabular-nums text-ink-soft">{money(nw.totalAssets, nw.currency)}</span>
                </span>
                {nw.totalLiabilities > 0 ? (
                  <span>
                    {t("liabilities")}:{" "}
                    <span className="tabular-nums text-ink-soft">{money(nw.totalLiabilities, nw.currency)}</span>
                  </span>
                ) : null}
                {nw.otherCurrencies.length > 0 ? (
                  <span className="text-ink-faint">
                    {t("other_currencies", { list: nw.otherCurrencies.join(", ") })}
                  </span>
                ) : null}
              </div>
              <div className="mt-5">
                <NetWorthChart points={points} caption={t("line_caption")} />
              </div>
            </GlassCard>

            {slices.length > 0 ? (
              <GlassCard>
                <Eyebrow>{t("allocation")}</Eyebrow>
                <div className="mt-3">
                  <AllocationDonut
                    slices={slices}
                    centerValue={money(nw.totalAssets, nw.currency)}
                    centerLabel={t("assets")}
                    ariaLabel={t("allocation_aria")}
                  />
                </div>
              </GlassCard>
            ) : null}
          </>
        )}

        <ManualAssetsPanel assets={assets} />

        <p className="px-1 text-[11px] text-ink-faint">{t("footnote")}</p>
      </div>
    </>
  );
}
