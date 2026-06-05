"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CloseIcon } from "@/components/ui/icon";
import { MicButton } from "@/components/ui/mic-button";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { createReminder } from "@/lib/data/reminder-actions";
import type { Locale } from "@/i18n/config";

/**
 * The "Add reminder" button + its detailed modal form. Title (with a beta
 * voice-dictate via the shared Whisper mic), date, time, and optional notes.
 * Creating goes through the existing createReminder server action (no new
 * reminder system) and shows a plain confirmation. Full natural-language
 * voice-to-reminder parsing is deferred (Round 19.5 + 21); this just dictates
 * into the title.
 */
export function ReminderDialog({ scopeName }: { scopeName: string | null }) {
  const t = useTranslations("calendar");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "added" | "error">("idle");

  // Default the date to today (local), so the common case is one tap away.
  const todayLocal = (() => {
    const d = new Date();
    const off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0, 10);
  })();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending]);

  function reset() {
    setTitle("");
    setNotes("");
    setStatus("idle");
  }

  function onSubmit(formData: FormData) {
    if (!title.trim()) return;
    setStatus("idle");
    startTransition(async () => {
      try {
        await createReminder(formData);
        setStatus("added");
        router.refresh();
        window.setTimeout(() => {
          setOpen(false);
          reset();
        }, 1100);
      } catch {
        setStatus("error");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-ink px-3 text-[13px] font-medium text-surface transition-base hover:bg-ink-soft"
      >
        <span aria-hidden className="text-[15px] leading-none">+</span>
        {t("add_reminder")}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-4 backdrop-blur-sm animate-fade-in sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={t("rd_title")}
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-surface-floating p-5 shadow-raised animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">{t("rd_title")}</h2>
                {scopeName ? (
                  <p className="mt-0.5 text-[11.5px] text-ink-faint">
                    {t("adding_to", { space: scopeName })}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                aria-label={t("rd_cancel")}
                className="shrink-0 text-ink-faint transition-base hover:text-ink"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <form action={onSubmit} className="space-y-3">
              <div>
                <label htmlFor="rd-title" className="mb-1 block text-eyebrow">
                  {t("rd_what")}
                </label>
                <div className="relative">
                  <AutoGrowTextarea
                    name="title"
                    value={title}
                    onChange={setTitle}
                    required
                    autoFocus
                    minRows={1}
                    maxRows={3}
                    placeholder={t("rd_what")}
                    aria-label={t("rd_what")}
                    className="block w-full rounded-lg border border-line bg-canvas/60 pe-11 ps-3 py-2 text-[13.5px] text-ink placeholder:text-ink-faint outline-none focus:border-ink-muted focus:bg-canvas"
                  />
                  <div className="absolute end-1 top-1 flex items-center">
                    <MicButton
                      size="sm"
                      onTranscribed={(text) =>
                        setTitle((prev) => (prev ? `${prev} ${text}` : text))
                      }
                      targetLanguage={locale}
                    />
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-ink-faint">{t("rd_voice")} · {t("rd_voice_hint")}</p>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label htmlFor="rd-date" className="mb-1 block text-eyebrow">
                    {t("rd_date")}
                  </label>
                  <input
                    id="rd-date"
                    type="date"
                    name="date"
                    required
                    defaultValue={todayLocal}
                    className="h-10 w-full rounded-lg border border-line bg-canvas px-2 text-[12.5px] text-ink-soft outline-none focus:border-ink-muted"
                  />
                </div>
                <div className="flex-1">
                  <label htmlFor="rd-time" className="mb-1 block text-eyebrow">
                    {t("rd_time")}
                  </label>
                  <input
                    id="rd-time"
                    type="time"
                    name="time"
                    className="h-10 w-full rounded-lg border border-line bg-canvas px-2 text-[12.5px] text-ink-soft outline-none focus:border-ink-muted"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="rd-notes" className="mb-1 block text-eyebrow">
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
                  className="block w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint outline-none focus:border-ink-muted focus:bg-canvas"
                />
              </div>

              <p className="text-[11.5px] text-ink-faint">{t("rd_notify")}</p>

              {status === "error" ? (
                <p className="text-[12px] text-claret">{t("rd_error")}</p>
              ) : status === "added" ? (
                <p className="text-[12px] text-sage">{t("rd_added")}</p>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => !pending && setOpen(false)}
                  className="inline-flex h-9 items-center rounded-lg px-3 text-[12.5px] text-ink-muted transition-base hover:text-ink"
                >
                  {t("rd_cancel")}
                </button>
                <button
                  type="submit"
                  disabled={pending || title.trim().length === 0}
                  className="inline-flex h-9 items-center rounded-lg bg-ink px-4 text-[12.5px] font-medium text-surface transition-base hover:bg-ink-soft disabled:opacity-50"
                >
                  {pending ? t("rd_saving") : t("rd_save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
