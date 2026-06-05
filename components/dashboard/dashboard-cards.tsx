"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ChevronUpIcon, ChevronDownIcon } from "@/components/ui/icon";
import { setDashboardCardPrefs } from "@/lib/data/dashboard-cards-actions";
import type { CardPref, StatCardKey } from "@/lib/daily/stat-cards";

/**
 * The Today daily-stats dashboard: the tailored, per-archetype card set, in an
 * order the user controls. Normal view renders the visible cards in order. The
 * "Customize" toggle reveals a manager to move each card up/down and show/hide
 * it; every change persists (setDashboardCardPrefs) and is applied optimistically.
 * Reorder is move-up/down (accessible + RTL-safe) rather than drag.
 *
 * Card nodes are rendered on the server and passed in by key, so this client
 * shell only orders and toggles them, never re-fetches.
 */
export function DashboardCards({
  initial,
  nodes,
}: {
  initial: CardPref[];
  nodes: Partial<Record<StatCardKey, ReactNode>>;
}) {
  const t = useTranslations("dashboardCards");
  const [prefs, setPrefs] = useState<CardPref[]>(initial);
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();

  // Only manage cards we actually have a node for.
  const managed = prefs.filter((p) => nodes[p.key]);
  const visible = managed.filter((p) => !p.hidden);

  function persist(next: CardPref[]) {
    setPrefs(next);
    startTransition(() => {
      void setDashboardCardPrefs(next);
    });
  }

  function move(key: StatCardKey, dir: -1 | 1) {
    const i = prefs.findIndex((p) => p.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= prefs.length) return;
    const next = prefs.slice();
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  }

  function toggleHide(key: StatCardKey) {
    persist(prefs.map((p) => (p.key === key ? { ...p, hidden: !p.hidden } : p)));
  }

  if (managed.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <Eyebrow>{t("title")}</Eyebrow>
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          className="text-[12px] text-ink-muted transition-base hover:text-ink"
        >
          {editing ? t("done") : t("customize")}
        </button>
      </div>

      {editing ? (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-raised">
          {managed.map((p, i) => (
            <li key={p.key} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{t(`card_${p.key}`)}</span>
              <button
                type="button"
                onClick={() => move(p.key, -1)}
                disabled={i === 0}
                aria-label={t("move_up")}
                className="text-ink-muted transition-base hover:text-ink disabled:opacity-30"
              >
                <ChevronUpIcon size={15} />
              </button>
              <button
                type="button"
                onClick={() => move(p.key, 1)}
                disabled={i === managed.length - 1}
                aria-label={t("move_down")}
                className="text-ink-muted transition-base hover:text-ink disabled:opacity-30"
              >
                <ChevronDownIcon size={15} />
              </button>
              <button
                type="button"
                onClick={() => toggleHide(p.key)}
                className="text-[11.5px] text-ink-muted transition-base hover:text-ink"
              >
                {p.hidden ? t("show") : t("hide")}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-4">
          {visible.map((p) => (
            <div key={p.key}>{nodes[p.key]}</div>
          ))}
        </div>
      )}
    </section>
  );
}
