"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createRitual, updateRitual, archiveRitual } from "@/lib/data/ritual-actions";
import type { Cadence } from "@/lib/rituals/streak";

export type RitualFormValue = {
  id: string;
  title: string;
  cadence: Cadence;
  days: number[];
  reminderTime: string | null;
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Short weekday label in the user's locale (0=Sun). 2024-01-07 is a Sunday. */
function dowLabel(i: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
    new Date(Date.UTC(2024, 0, 7 + i)),
  );
}

/** Create or edit a ritual. Inline (not a modal): name, cadence, optional
 *  weekday picker, optional reminder time. Archive lives here in edit mode. */
export function RitualForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: RitualFormValue | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("health");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [cadence, setCadence] = useState<Cadence>(initial?.cadence ?? "daily");
  const [days, setDays] = useState<number[]>(
    initial?.cadence === "weekly" && initial.days.length ? initial.days : ALL_DAYS,
  );
  const [reminderTime, setReminderTime] = useState<string>(initial?.reminderTime ?? "");

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  function save() {
    if (!title.trim() || pending) return;
    const input = {
      title,
      cadence,
      days: cadence === "weekly" ? days : ALL_DAYS,
      reminderTime: reminderTime || null,
    };
    startTransition(async () => {
      const res = initial ? await updateRitual(initial.id, input) : await createRitual(input);
      if (res.ok) {
        router.refresh();
        onDone();
      }
    });
  }

  function archive() {
    if (!initial || pending) return;
    startTransition(async () => {
      const res = await archiveRitual(initial.id);
      if (res.ok) {
        router.refresh();
        onDone();
      }
    });
  }

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface-raised p-4">
      <div>
        <label className="text-eyebrow mb-1 block" htmlFor="ritual-title">
          {t("ritual_name")}
        </label>
        <input
          id="ritual-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("ritual_name_ph")}
          className="transition-base block w-full rounded-xl border border-line bg-canvas/40 px-3 py-2 text-[14px] text-ink outline-none placeholder:text-ink-faint focus:bg-canvas"
        />
      </div>

      <div>
        <span className="text-eyebrow mb-1 block">{t("ritual_cadence")}</span>
        <div className="flex gap-2">
          {(["daily", "weekly"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCadence(c)}
              aria-pressed={cadence === c}
              className={`transition-base rounded-xl px-3 py-1.5 text-[13px] ${
                cadence === c
                  ? "bg-ink text-surface"
                  : "border border-line text-ink-muted hover:text-ink"
              }`}
            >
              {c === "daily" ? t("cadence_daily") : t("cadence_weekly")}
            </button>
          ))}
        </div>
        {cadence === "weekly" ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ALL_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                aria-pressed={days.includes(d)}
                className={`transition-base h-9 min-w-9 rounded-lg px-2 text-[12px] ${
                  days.includes(d)
                    ? "bg-ink text-surface"
                    : "border border-line text-ink-muted hover:text-ink"
                }`}
              >
                {dowLabel(d, locale)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div>
        <label className="text-eyebrow mb-1 block" htmlFor="ritual-time">
          {t("ritual_reminder")}
        </label>
        <input
          id="ritual-time"
          type="time"
          value={reminderTime}
          onChange={(e) => setReminderTime(e.target.value)}
          className="transition-base rounded-xl border border-line bg-canvas/40 px-3 py-2 text-[14px] text-ink outline-none focus:bg-canvas"
        />
        {reminderTime ? (
          <button
            type="button"
            onClick={() => setReminderTime("")}
            className="ms-3 text-[12px] text-ink-faint underline hover:text-ink"
          >
            {t("reminder_clear")}
          </button>
        ) : null}
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending || !title.trim()}
            className="cta transition-base inline-flex h-9 items-center rounded-xl bg-ink px-4 text-[13px] text-surface hover:bg-ink-soft disabled:opacity-40"
          >
            {pending ? t("saving") : t("save")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="transition-base inline-flex h-9 items-center rounded-xl px-3 text-[13px] text-ink-muted hover:text-ink"
          >
            {t("cancel")}
          </button>
        </div>
        {initial ? (
          <button
            type="button"
            onClick={archive}
            disabled={pending}
            className="transition-base inline-flex h-9 items-center rounded-xl px-3 text-[13px] text-claret hover:underline disabled:opacity-40"
          >
            {t("archive")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
