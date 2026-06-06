"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { undoSetupChange } from "@/app/dashboard/reshape/actions";
import type { SetupChange } from "@/lib/onboarding/setup-changes";

/** Last 14 days of setup actions, each undoable within 24 hours. */
export function RecentSetupChanges({ changes }: { changes: SetupChange[] }) {
  const t = useTranslations("reshape");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  function undo(id: string, force: boolean) {
    startTransition(async () => {
      const r = await undoSetupChange(id, force);
      if (r.needsConfirm) {
        setConfirmId(id);
        return;
      }
      if (r.ok) {
        setConfirmId(null);
        setDone((p) => new Set(p).add(id));
        router.refresh();
      }
    });
  }

  if (changes.length === 0) {
    return <p className="text-[12.5px] text-ink-faint">{t("changes_empty")}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {changes.map((c) => {
        const reverted = c.reverted || done.has(c.id);
        return (
          <li
            key={c.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-soft">
              {c.items.length === 0 ? (
                <span>{t("changes_generic")}</span>
              ) : (
                c.items.map((it, i) => (
                  <span key={i}>
                    {i > 0 ? <span className="text-ink-faint">, </span> : null}
                    {it.type === "delete" ? (
                      <span className="text-claret line-through">{it.label}</span>
                    ) : it.type === "rename" ? (
                      <span>
                        {it.label} {"->"} <span className="text-ink">{it.to}</span>
                      </span>
                    ) : (
                      <span>{it.label}</span>
                    )}
                  </span>
                ))
              )}
              {reverted ? (
                <span className="ml-2 text-ink-faint">{t("changes_reverted")}</span>
              ) : null}
            </span>
            {!reverted && c.undoable ? (
              confirmId === c.id ? (
                <button
                  type="button"
                  onClick={() => undo(c.id, true)}
                  disabled={pending}
                  className="transition-base shrink-0 text-[12px] font-medium text-claret hover:underline disabled:opacity-50"
                >
                  {t("changes_undo_confirm")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => undo(c.id, false)}
                  disabled={pending}
                  className="transition-base shrink-0 text-[12px] text-ink-faint hover:text-ink disabled:opacity-50"
                >
                  {t("changes_undo")}
                </button>
              )
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
