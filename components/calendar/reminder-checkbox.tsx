"use client";

import { useOptimistic, useTransition } from "react";
import { CheckIcon } from "@/components/ui/icon";
import { toggleReminderDone } from "@/lib/data/reminder-actions";

/**
 * Reminder checkbox with optimistic flip. The previous version waited
 * for the server roundtrip before the box ticked, which made the
 * calendar feel laggy on every interaction. Now the visual state
 * updates the moment you click; the server confirms in the background
 * and the page revalidates the calendar route only (not the entire
 * layout) so the sidebar stays warm.
 */
export function ReminderCheckbox({ id, initialDone }: { id: string; initialDone: boolean }) {
  const [done, setDone] = useOptimistic(initialDone);
  const [, startTransition] = useTransition();

  async function onClick() {
    // Flip locally, then call the server action. useOptimistic falls
    // back to initialDone (the prop) if the action throws.
    startTransition(async () => {
      setDone(!done);
      const fd = new FormData();
      fd.set("id", id);
      fd.set("done", String(done));
      await toggleReminderDone(fd);
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={done ? "Mark not done" : "Mark done"}
      className={`transition-base inline-flex h-4 w-4 items-center justify-center rounded border ${
        done
          ? "border-sage bg-sage text-surface"
          : "border-line-strong bg-surface hover:border-ink-muted"
      }`}
    >
      {done ? <CheckIcon size={10} /> : null}
    </button>
  );
}
