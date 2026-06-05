"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteReminder, confirmReminder } from "@/lib/data/reminder-actions";
import { ReminderFormModal, type ReminderInitial } from "./reminder-dialog";

/** Local date (YYYY-MM-DD) + time (HH:MM) from a stored instant, for prefilling
 *  the edit form in the user's own timezone. */
function localParts(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

/**
 * Edit + delete (and Keep for suggestions) for one reminder on the agenda.
 * Always visible (not hover-gated) so it works on touch. Edit opens the shared
 * reminder modal prefilled; delete asks for a one-tap confirm first.
 */
export function ReminderActions({
  id,
  title,
  notes,
  dueAtISO,
  suggested,
}: {
  id: string;
  title: string;
  notes: string | null;
  dueAtISO: string | null;
  suggested: boolean;
}) {
  const t = useTranslations("calendar");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const { date, time } = localParts(dueAtISO);
  const initial: ReminderInitial = { id, title, date, time, notes: notes ?? "" };

  function keep() {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await confirmReminder(fd);
      router.refresh();
    });
  }

  function doDelete() {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await deleteReminder(fd);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              onClick={doDelete}
              disabled={pending}
              className="text-[11.5px] font-medium text-claret transition-base hover:underline disabled:opacity-50"
            >
              {t("ra_delete_confirm")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="text-[11.5px] text-ink-faint transition-base hover:text-ink"
            >
              {t("rd_cancel")}
            </button>
          </>
        ) : (
          <>
            {suggested ? (
              <button
                type="button"
                onClick={keep}
                disabled={pending}
                className="text-[11.5px] text-ink-muted transition-base hover:text-ink disabled:opacity-50"
              >
                {t("ra_keep")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[11.5px] text-ink-muted transition-base hover:text-ink"
            >
              {t("ra_edit")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={t("ra_delete")}
              className="text-[11.5px] text-ink-faint transition-base hover:text-claret"
            >
              {t("ra_delete")}
            </button>
          </>
        )}
      </div>

      {editing ? (
        <ReminderFormModal
          mode="edit"
          initial={initial}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}
