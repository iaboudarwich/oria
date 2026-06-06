"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sheet } from "@/components/ui/sheet";
import { TextLogForm } from "@/components/section/text-log-form";
import { UploadIcon, CalendarIcon } from "@/components/ui/icon";

/**
 * Center quick-capture action for the primary nav (Round 16.9 follow-up). A
 * prominent circular "+" that sits in the phone thumb zone (and on the tablet
 * rail), visually distinct from the flat tabs and sized for the thumb. It opens
 * a bottom Sheet to capture in one tap: jot or paste a note (the existing
 * text-log pipeline), upload a file, or add a reminder.
 *
 * The center slot is intentionally one element so the Round 19.5 voice button
 * can later replace this "+" or sit beside it. The "+" glyph is non-directional,
 * so it is RTL-safe.
 */
export function CaptureButton() {
  const t = useTranslations("capture");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={t("open")}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="transition-base inline-flex h-14 w-14 -translate-y-2 items-center justify-center rounded-full border-2 border-canvas bg-brand text-surface shadow-lg shadow-brand/30 hover:bg-brand/90 active:scale-95 md:translate-y-0"
      >
        <span aria-hidden className="text-[26px] leading-none font-light">
          +
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen} title={t("title")} description={t("subtitle")}>
        <div className="space-y-4">
          <TextLogForm label={t("note_label")} placeholder={t("note_ph")} />
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/dashboard/inbox"
              onClick={() => setOpen(false)}
              className="transition-base flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-3 py-3 text-[13px] text-ink hover:bg-canvas"
            >
              <UploadIcon size={16} />
              {t("upload")}
            </Link>
            <Link
              href="/dashboard/calendar"
              onClick={() => setOpen(false)}
              className="transition-base flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-3 py-3 text-[13px] text-ink hover:bg-canvas"
            >
              <CalendarIcon size={16} />
              {t("reminder")}
            </Link>
          </div>
        </div>
      </Sheet>
    </>
  );
}
