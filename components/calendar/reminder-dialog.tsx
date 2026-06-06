"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { MicButton } from "@/components/ui/mic-button";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Sheet } from "@/components/ui/sheet";
import { createReminder, updateReminder } from "@/lib/data/reminder-actions";
import { useFocusNext } from "@/lib/hooks/use-focus-next";
import type { Locale } from "@/i18n/config";

export type ReminderInitial = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD (user-local)
  time: string; // HH:MM (user-local)
  notes: string;
};

/** Today's local date (YYYY-MM-DD) for the create default. */
function todayLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

/**
 * The detailed reminder modal, used for both creating and editing. Title (with a
 * beta voice-dictate), date, time, and optional notes. Create and edit both go
 * through the same server actions, so an edited time is honored exactly in the
 * user's local zone with no fallback (same corrected logic as create). Mount it
 * only while open so it seeds fresh from `initial` each time.
 */
export function ReminderFormModal({
  mode,
  initial,
  scopeName,
  onClose,
}: {
  mode: "create" | "edit";
  initial?: ReminderInitial | null;
  scopeName?: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error" | "notime">("idle");
  const isEdit = mode === "edit";
  // On open, bring the form into view and put focus in the title field.
  const titleRef = useFocusNext<HTMLTextAreaElement>(true);

  // The form lives in a bottom Sheet (vaul). Keep it mounted while it animates
  // out: close requests flip sheetOpen, then onClose unmounts after the slide.
  const [sheetOpen, setSheetOpen] = useState(true);
  const requestClose = useCallback(() => {
    if (pending) return;
    setSheetOpen(false);
    window.setTimeout(onClose, 220);
  }, [pending, onClose]);

  function onSubmit(formData: FormData) {
    if (!title.trim()) return;
    // The time must be chosen: a reminder is never silently saved at "now".
    if (!String(formData.get("time") ?? "").trim()) {
      setStatus("notime");
      return;
    }
    setStatus("idle");
    startTransition(async () => {
      try {
        if (isEdit) await updateReminder(formData);
        else await createReminder(formData);
        setStatus("saved");
        router.refresh();
        window.setTimeout(requestClose, 800);
      } catch {
        setStatus("error");
      }
    });
  }

  return (
    <Sheet
      open={sheetOpen}
      onOpenChange={(o) => {
        if (!o) requestClose();
      }}
      title={isEdit ? t("rd_edit_title") : t("rd_title")}
      description={!isEdit && scopeName ? t("adding_to", { space: scopeName }) : null}
    >
      <form action={onSubmit} className="space-y-3">
        {isEdit && initial ? <input type="hidden" name="id" value={initial.id} /> : null}
        <div>
          <label htmlFor="rd-title" className="text-eyebrow mb-1 block">
            {t("rd_what")}
          </label>
          <div className="relative">
            <AutoGrowTextarea
              ref={titleRef}
              name="title"
              value={title}
              onChange={setTitle}
              required
              minRows={1}
              maxRows={3}
              placeholder={t("rd_what")}
              aria-label={t("rd_what")}
              className="block w-full rounded-lg border border-line bg-canvas/60 py-2 ps-3 pe-11 text-[13.5px] text-ink outline-none placeholder:text-ink-faint focus:border-ink-muted focus:bg-canvas"
            />
            <div className="absolute end-1 top-1 flex items-center">
              <MicButton
                size="sm"
                onTranscribed={(text) => setTitle((prev) => (prev ? `${prev} ${text}` : text))}
                targetLanguage={locale}
              />
            </div>
          </div>
          <p className="mt-1 text-[11px] text-ink-faint">
            {t("rd_voice")} · {t("rd_voice_hint")}
          </p>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label htmlFor="rd-date" className="text-eyebrow mb-1 block">
              {t("rd_date")}
            </label>
            <input
              id="rd-date"
              type="date"
              name="date"
              required
              defaultValue={initial?.date ?? todayLocal()}
              className="h-10 w-full rounded-lg border border-line bg-canvas px-2 text-[12.5px] text-ink-soft outline-none focus:border-ink-muted"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="rd-time" className="text-eyebrow mb-1 block">
              {t("rd_time")}
            </label>
            <input
              id="rd-time"
              type="time"
              name="time"
              required
              defaultValue={initial?.time ?? ""}
              className="h-10 w-full rounded-lg border border-line bg-canvas px-2 text-[12.5px] text-ink-soft outline-none focus:border-ink-muted"
            />
          </div>
        </div>

        <div>
          <label htmlFor="rd-notes" className="text-eyebrow mb-1 block">
            {t("rd_notes")}
          </label>
          <AutoGrowTextarea
            name="notes"
            value={notes}
            onChange={setNotes}
            minRows={2}
            maxRows={6}
            placeholder={t("rd_notes_ph")}
            aria-label={t("rd_notes")}
            className="block w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-ink-muted focus:bg-canvas"
          />
        </div>

        <p className="text-[11.5px] text-ink-faint">{t("rd_notify")}</p>

        {status === "error" ? (
          <p className="text-[12px] text-claret">{t("rd_error")}</p>
        ) : status === "notime" ? (
          <p className="text-[12px] text-claret">{t("rd_need_time")}</p>
        ) : status === "saved" ? (
          <p className="text-[12px] text-sage">{isEdit ? t("rd_updated") : t("rd_added")}</p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={requestClose}
            className="transition-base inline-flex h-9 items-center rounded-lg px-3 text-[12.5px] text-ink-muted hover:text-ink"
          >
            {t("rd_cancel")}
          </button>
          <button
            type="submit"
            disabled={pending || title.trim().length === 0}
            className="transition-base inline-flex h-9 items-center rounded-lg bg-ink px-4 text-[12.5px] font-medium text-surface hover:bg-ink-soft disabled:opacity-50"
          >
            {pending ? t("rd_saving") : isEdit ? t("rd_update") : t("rd_save")}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/** The "Add reminder" button (top-right of the calendar) that opens the modal
 *  in create mode. */
export function ReminderDialog({ scopeName }: { scopeName: string | null }) {
  const t = useTranslations("calendar");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="transition-base inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-ink px-3 text-[13px] font-medium text-surface hover:bg-ink-soft"
      >
        <span aria-hidden className="text-[15px] leading-none">
          +
        </span>
        {t("add_reminder")}
      </button>
      {open ? (
        <ReminderFormModal mode="create" scopeName={scopeName} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
