import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ScoreRing } from "@/components/ui/score-ring";
import { ArrowRightIcon } from "@/components/ui/icon";
import { netBalance } from "@/lib/health/compute";
import type { HealthToday } from "@/lib/daily/health-today";

/**
 * Today's single Health stat: recovery (or sleep, if recovery is absent) as the
 * headline, with today's calorie balance beneath when both sides exist. Links
 * into the Health surface. Rendered only when loadHealthToday returns data.
 */
export async function HealthStatCard({
  data,
  rituals,
}: {
  data: HealthToday | null;
  rituals?: { done: number; total: number } | null;
}) {
  const t = await getTranslations("health");
  if (!data && !rituals) return null;

  const usesRecovery = data?.recoveryPct != null;
  const score = usesRecovery ? data!.recoveryPct! : data?.sleepPct ?? null;
  const hero = usesRecovery
    ? t("today_recovery", { n: data!.recoveryPct! })
    : data?.sleepPct != null
      ? t("today_sleep", { n: data.sleepPct })
      : null;

  const net = data ? netBalance(data.intakeKcal, data.burnKcal) : null;
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
      <div className="mt-2 flex items-center gap-4">
        {score != null ? <ScoreRing score={score} size={68} /> : null}
        <div className="min-w-0 space-y-1">
          {/* Insight first (the words), the dial is the evidence beside it. */}
          {hero ? <p className="text-[14px] text-ink">{hero}</p> : null}
          {balance ? (
            <p className="text-[13px] text-ink-muted tabular-nums">
              {t("balance_title")}: {balance}
            </p>
          ) : null}
          {rituals ? (
            <p className="text-[13px] text-ink-muted tabular-nums">
              {t("today_rituals", { done: rituals.done, total: rituals.total })}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
