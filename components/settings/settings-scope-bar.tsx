"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { scopeLabel, type ScopeKind } from "@/lib/settings/scope";

export type ScopeOption = { id: string; kind: ScopeKind; name: string };

/**
 * The persistent "Editing: ..." control at the top of Settings. Changing it
 * re-scopes the panels in place via the `?scope=` param (it never switches the
 * app's active space), so the user adjusts any space's settings without leaving
 * Settings.
 */
export function SettingsScopeBar({
  scopes,
  currentId,
  tab,
}: {
  scopes: ScopeOption[];
  currentId: string;
  tab: string;
}) {
  const t = useTranslations("settingsScope");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (id === currentId) return;
    startTransition(() => {
      router.push(`/dashboard/settings?tab=${tab}&scope=${id}`);
    });
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-raised px-3 py-2.5">
      <span className="text-[12px] text-ink-muted">{t("editing")}</span>
      <label className="sr-only" htmlFor="settings-scope">
        {t("switch_label")}
      </label>
      <select
        id="settings-scope"
        value={currentId}
        onChange={onChange}
        disabled={pending}
        className="transition-base rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] font-medium text-ink outline-none focus:border-ink disabled:opacity-60"
      >
        {scopes.map((s) => (
          <option key={s.id} value={s.id}>
            {scopeLabel(t, s.kind, s.name)}
          </option>
        ))}
      </select>
    </div>
  );
}
