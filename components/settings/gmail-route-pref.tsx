"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  setAutoRoutePreference,
  type AutoRoutePreference,
} from "@/lib/integrations/gmail/connection-actions";

/**
 * Account-level auto-routing preference (how aggressively to auto-add what Oria
 * finds). Applies across every connected Gmail account.
 */
export function GmailRoutePref({ initial }: { initial: AutoRoutePreference }) {
  const t = useTranslations("connections");
  const router = useRouter();
  const [pref, setPref] = useState<AutoRoutePreference>(initial);
  const [pending, startTransition] = useTransition();

  function change(next: AutoRoutePreference) {
    setPref(next);
    startTransition(async () => {
      await setAutoRoutePreference(next);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-surface-raised p-5">
      <p className="text-[12.5px] font-medium text-ink">{t("route_title")}</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {(["always_review", "auto_confident", "auto_all"] as const).map((opt) => (
          <label key={opt} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1">
            <input
              type="radio"
              name="route-pref"
              checked={pref === opt}
              onChange={() => change(opt)}
              disabled={pending}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-ink"
            />
            <span className="text-[12.5px] text-ink-soft">{t(`route_${opt}`)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
