"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { blockFocusTime } from "@/lib/daily/today-actions";
import { ClockIcon } from "@/components/ui/icon";

/**
 * F5: the overcommitment warning, made actionable. When the day is heavy it
 * offers to block focus time in the largest open gap, creating a real "Focus
 * time" reminder. (The dropped standalone suggestion #6 folds in here, so the
 * overcommitted-day signal has one home.)
 */
export function OvercommitWarning({
  organizationId,
  meetingCount,
  meetingHours,
  holdStartsAt,
}: {
  organizationId: string;
  meetingCount: number;
  meetingHours: number;
  holdStartsAt: string | null;
}) {
  const t = useTranslations("dailyLoop");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [blocked, setBlocked] = useState(false);

  function block() {
    if (!holdStartsAt) return;
    setBlocked(true);
    startTransition(async () => {
      await blockFocusTime({ organizationId, startsAt: holdStartsAt });
      router.refresh();
    });
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50/60 px-4 py-3.5 dark:border-amber-500/30 dark:bg-amber-500/10">
      <span className="mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden>
        <ClockIcon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-ink">{t("overcommit_title")}</p>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          {t("overcommit_body", { count: meetingCount, hours: meetingHours })}
        </p>
      </div>
      {holdStartsAt ? (
        <button
          type="button"
          onClick={block}
          disabled={pending || blocked}
          className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface transition-base hover:bg-ink-soft disabled:opacity-50"
        >
          {blocked ? t("overcommit_blocked") : t("overcommit_action")}
        </button>
      ) : null}
    </div>
  );
}
