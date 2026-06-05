"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircleIcon, ClockIcon } from "@/components/ui/icon";
import { toggleRitualDone } from "@/lib/data/ritual-actions";
import { RitualForm, type RitualFormValue } from "./ritual-form";
import { RitualVoiceLog } from "./ritual-voice-log";
import type { Cadence } from "@/lib/rituals/streak";

export type RitualVM = {
  id: string;
  title: string;
  cadence: Cadence;
  days: number[];
  reminderTime: string | null;
  current: number;
  best: number;
  freezes: number;
  scheduledToday: boolean;
  doneToday: boolean;
};

function dowLabel(i: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
    new Date(Date.UTC(2024, 0, 7 + i)),
  );
}

export function RitualsClient({ rituals }: { rituals: RitualVM[] }) {
  const t = useTranslations("health");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RitualVM | null>(null);

  const formValue: RitualFormValue | null = editing
    ? {
        id: editing.id,
        title: editing.title,
        cadence: editing.cadence,
        days: editing.days,
        reminderTime: editing.reminderTime,
      }
    : null;

  const showForm = creating || editing !== null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between px-1">
        <span className="text-eyebrow">{t("rituals_count", { n: rituals.length })}</span>
        {!showForm ? (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setCreating(true);
            }}
            className="cta inline-flex h-9 items-center rounded-xl bg-ink px-3 text-[12.5px] text-surface transition-base hover:bg-ink-soft"
          >
            {t("new_ritual")}
          </button>
        ) : null}
      </div>

      {showForm ? (
        <RitualForm
          initial={formValue}
          onDone={() => {
            setCreating(false);
            setEditing(null);
          }}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}

      {rituals.length > 0 ? (
        <ul className="space-y-2">
          {rituals.map((r) => (
            <RitualRow key={r.id} ritual={r} onEdit={() => setEditing(r)} />
          ))}
        </ul>
      ) : !showForm ? (
        <p className="rounded-2xl border border-line bg-surface-raised px-4 py-8 text-center text-[13px] text-ink-muted">
          {t("ritual_none")}
        </p>
      ) : null}

      <div>
        <h2 className="mb-2 px-1 text-eyebrow">{t("log_ritual_label")}</h2>
        <RitualVoiceLog />
      </div>

      <p className="px-1 text-[11px] text-ink-faint">{t("freezes_help")}</p>
    </div>
  );
}

function RitualRow({ ritual, onEdit }: { ritual: RitualVM; onEdit: () => void }) {
  const t = useTranslations("health");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(ritual.doneToday);

  function toggle() {
    if (pending) return;
    setDone((d) => !d); // optimistic
    startTransition(async () => {
      const res = await toggleRitualDone(ritual.id);
      if (res.ok) setDone(res.done);
      else setDone(ritual.doneToday);
    });
  }

  const cadenceText =
    ritual.cadence === "daily"
      ? t("cadence_daily")
      : ritual.days.map((d) => dowLabel(d, locale)).join(" ");

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface-raised p-4">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={done}
        aria-label={done ? t("done_today") : t("mark_done")}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-base ${
          done ? "border-sage bg-sage/15 text-sage" : "border-line text-ink-faint hover:border-ink/30"
        }`}
      >
        {done ? <CheckCircleIcon size={20} /> : <span className="h-4 w-4 rounded-full border border-current" />}
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-ink">{ritual.title}</p>
        <p className="flex items-center gap-2 text-[11.5px] text-ink-faint">
          <span>{cadenceText}</span>
          {ritual.reminderTime ? (
            <span className="inline-flex items-center gap-1">
              <ClockIcon size={12} />
              {ritual.reminderTime}
            </span>
          ) : null}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[14px] font-semibold tabular-nums text-ink">
          {t("streak_value", { n: ritual.current })}
        </p>
        <p className="text-[11px] text-ink-faint tabular-nums">
          {t("best_value", { n: ritual.best })} · {t("freezes_value", { n: ritual.freezes })}
        </p>
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 rounded-lg px-2 py-1 text-[12px] text-ink-faint transition-base hover:text-ink"
      >
        {t("edit")}
      </button>
    </li>
  );
}
