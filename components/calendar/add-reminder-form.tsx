"use client";

import { useRef, useState, useTransition } from "react";
import { createReminder } from "@/lib/data/reminder-actions";

/**
 * Client wrapper around createReminder so we can show inline "Reminder
 * added" feedback. The previous version was a plain server-action form
 * that cleared on success with no visible confirmation, which left the
 * user uncertain whether anything happened.
 *
 * The server action revalidates /dashboard/calendar so the new reminder
 * appears in the list. The inline confirmation is a short-lived line
 * below the inputs that fades after a few seconds.
 */
export function AddReminderForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "added" | "error">("idle");

  function onSubmit(formData: FormData) {
    setStatus("idle");
    startTransition(async () => {
      try {
        await createReminder(formData);
        setStatus("added");
        formRef.current?.reset();
        window.setTimeout(() => setStatus("idle"), 3000);
      } catch {
        setStatus("error");
      }
    });
  }

  return (
    <>
      <form
        ref={formRef}
        action={onSubmit}
        className="flex flex-col gap-2 border-t border-line p-3 sm:flex-row sm:items-center"
      >
        <input
          type="text"
          name="title"
          required
          autoFocus
          placeholder="What to remember"
          className="h-10 flex-1 rounded-lg bg-canvas/60 px-3 text-[13.5px] text-ink placeholder:text-ink-faint outline-none focus:bg-canvas"
        />
        <input
          type="date"
          name="date"
          required
          className="h-10 rounded-lg border border-line bg-canvas px-2 text-[12.5px] text-ink-soft outline-none focus:border-ink-muted sm:w-[140px]"
        />
        <input
          type="time"
          name="time"
          className="h-10 rounded-lg border border-line bg-canvas px-2 text-[12.5px] text-ink-soft outline-none focus:border-ink-muted sm:w-[110px]"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-ink px-4 text-[13px] text-surface hover:bg-ink-soft transition-base disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </form>
      {status === "added" ? (
        <p className="border-t border-line px-4 py-2 text-[11.5px] text-ink-muted">
          Reminder added. It&apos;s now on your calendar.
        </p>
      ) : status === "error" ? (
        <p className="border-t border-line px-4 py-2 text-[11.5px] text-claret">
          Couldn&apos;t save the reminder. Try again in a moment.
        </p>
      ) : null}
    </>
  );
}
