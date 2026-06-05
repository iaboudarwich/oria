import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Eyebrow } from "@/components/ui/eyebrow";
import { HeroNumber } from "@/components/ui/hero-number";
import { ArrowRightIcon } from "@/components/ui/icon";
import { netBalance } from "@/lib/health/compute";
import type { HealthToday } from "@/lib/daily/health-today";

/**
 * Today's single Health stat: recovery (or sleep, if recovery is absent) as the
 * headline, with today's calorie balance beneath when both sides exist. Links
 * into the Health surface. Rendered only when loadHealthToday returns data.
 */
export async function HealthStatCard({ data }: { data: HealthToday }) {
  const t = await getTranslations("health");

  const usesRecovery = data.recoveryPct !== null;
  const hero = usesRecovery
    ? t("today_recovery", { n: data.recoveryPct! })
    : data.sleepPct !== null
      ? t("today_sleep", { n: data.sleepPct! })
      : null;

  const net = netBalance(data.intakeKcal, data.burnKcal);
  let balance: string | null = null;
  if (net !== null) {
    balance =
      net < 0
        ? t("balance_deficit", { n: Math.abs(net).toLocaleString() })
        : net > 0
          ? t("balance_surplus", { n: net.toLocaleString() })
          : t("balance_even");
  }

  return (
    <Link
      href="/dashboard/health"
      className="block rounded-2xl border border-line bg-surface-raised p-4 transition-base hover:border-ink/20"
    >
      <div className="flex items-center justify-between">
        <Eyebrow>{t("today_title")}</Eyebrow>
        <span className="text-ink-faint">
          <ArrowRightIcon size={14} />
        </span>
      </div>
      {hero ? <HeroNumber className="mt-1" value={hero} /> : null}
      {balance ? (
        <p className="mt-2 text-[13px] text-ink-muted tabular-nums">
          {t("balance_title")}: {balance}
        </p>
      ) : null}
    </Link>
  );
}
