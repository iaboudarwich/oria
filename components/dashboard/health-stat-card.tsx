import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ScoreRing } from "@/components/ui/score-ring";
import { ArrowRightIcon } from "@/components/ui/icon";
import { netBalance, scoreState } from "@/lib/health/compute";
import { DATA_VAR, DATA_TRACK } from "@/lib/ui/status-color";
import type { HealthToday } from "@/lib/daily/health-today";

/**
 * Today's Health hero tile: the recovery score (or sleep, if recovery is
 * absent) as a real dial in its semantic color, with a one-word state read
 * beside it, then today's calorie balance + rituals. Links into the Health
 * surface for the full dial set. Rendered only when loadHealthToday returns data.
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
  const score = usesRecovery ? data!.recoveryPct! : (data?.sleepPct ?? null);
  const metricLabel = usesRecovery ? t("recovery") : t("sleep_performance");
  const colorVar = usesRecovery ? DATA_VAR.recovery : DATA_VAR.sleep;
  const trackVar = usesRecovery ? DATA_TRACK.recovery : DATA_TRACK.sleep;
  const state = score != null ? t(`state_${scoreState(score)}` as "state_primed") : null;

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
      className="transition-base block rounded-card border border-line bg-surface p-4 shadow-soft hover:border-ink/20"
    >
      <div className="flex items-center justify-between">
        <Eyebrow>{t("today_title")}</Eyebrow>
        <span className="text-ink-faint">
          <ArrowRightIcon size={14} />
        </span>
      </div>
      <div className="mt-2 flex items-center gap-4">
        {score != null ? (
          <ScoreRing
            score={score}
            size={78}
            colorVar={colorVar}
            trackVar={trackVar}
            center={
              <span className="num text-[19px] font-semibold" style={{ color: colorVar }}>
                {Math.round(score)}
              </span>
            }
            ariaLabel={`${metricLabel} ${Math.round(score)}`}
          />
        ) : null}
        <div className="min-w-0 space-y-0.5">
          <p className="text-[14px] font-medium text-ink">{metricLabel}</p>
          {state ? (
            <p className="text-[13px] font-semibold" style={{ color: colorVar }}>
              {state}
            </p>
          ) : null}
          {balance ? <p className="num text-[12.5px] text-ink-muted">{balance}</p> : null}
          {rituals ? (
            <p className="num text-[12.5px] text-ink-muted">
              {t("today_rituals", { done: rituals.done, total: rituals.total })}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
