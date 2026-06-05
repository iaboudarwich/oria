import { getTranslations } from "next-intl/server";
import { Eyebrow } from "@/components/ui/eyebrow";

/**
 * Calorie balance for today: energy in (logged meals) vs energy out (WHOOP day
 * energy). Degrades gracefully: with only one side it shows that side and a
 * plain nudge for the missing one; with neither it invites both. Never invents
 * a number.
 */
export async function CalorieBalanceCard({
  intakeKcal,
  burnKcal,
}: {
  intakeKcal: number | null;
  burnKcal: number | null;
}) {
  const t = await getTranslations("health");
  const hasIn = intakeKcal !== null && intakeKcal > 0;
  const hasOut = burnKcal !== null && burnKcal > 0;

  let readout: string;
  let tone = "text-ink";
  if (hasIn && hasOut) {
    const net = Math.round(intakeKcal! - burnKcal!);
    if (net < 0) {
      readout = t("balance_deficit", { n: Math.abs(net).toLocaleString() });
      tone = "text-sage";
    } else if (net > 0) {
      readout = t("balance_surplus", { n: net.toLocaleString() });
      tone = "text-ink";
    } else {
      readout = t("balance_even");
    }
  } else if (hasIn) {
    readout = t("balance_need_out");
    tone = "text-ink-muted";
  } else if (hasOut) {
    readout = t("balance_need_in");
    tone = "text-ink-muted";
  } else {
    readout = t("balance_need_both");
    tone = "text-ink-muted";
  }

  return (
    <div className="rounded-2xl border border-line bg-surface-raised p-4">
      <Eyebrow>{t("balance_title")}</Eyebrow>
      <div className="mt-2 flex items-end justify-between gap-4">
        <p className={`text-[20px] font-semibold tracking-tight ${tone}`}>{readout}</p>
        <div className="flex items-baseline gap-4 text-[12.5px] text-ink-muted tabular-nums">
          <span>
            {t("balance_in")} {hasIn ? intakeKcal!.toLocaleString() : "·"}
          </span>
          <span>
            {t("balance_out")} {hasOut ? burnKcal!.toLocaleString() : "·"}
          </span>
        </div>
      </div>
    </div>
  );
}
