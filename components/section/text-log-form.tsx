"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "@/components/ui/icon";
import {
  logFromText,
  type LogFromTextInput,
} from "@/lib/data/text-log-actions";

/**
 * Compact textarea + submit for typed-text logging. The user types a
 * note like "I ate 1.5 cups pasta" and Oria turns it into a memory_item
 * (and a reminder/calendar entry where applicable). Section context is
 * passed in by the parent so the model has a strong prior, e.g. on the
 * Diet page everything biases toward a meal item.
 *
 * Stays minimal by design: no preview, no draft state, no confirmation
 * modal. The Server Action returns a summary string we show inline
 * for a few seconds, then `router.refresh()` makes the new record show
 * up in the surrounding section view.
 *
 * Timezone correctness: we capture Intl.DateTimeFormat().resolvedOptions()
 * .timeZone + new Date().toISOString() on submit, so the model resolves
 * "yesterday" against the user's wall clock, not the server's region.
 */
export function TextLogForm({
  smartSection = null,
  section = null,
  customSectionId = null,
  customSectionName = null,
  placeholder = "Type a quick note. e.g. ‘Lunch: chicken bowl, rice, salad’",
  label = "Or just type it",
  rows = 2,
}: {
  smartSection?: "diet" | "bills" | null;
  section?: string | null;
  customSectionId?: string | null;
  customSectionName?: string | null;
  placeholder?: string;
  label?: string;
  rows?: number;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function submit() {
    const value = text.trim();
    if (!value || pending) return;
    setError(null);
    setOk(null);
    const timezone =
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "UTC";
    const nowISO = new Date().toISOString();
    const payload: LogFromTextInput = {
      text: value,
      smart_section: smartSection,
      section: section,
      custom_section_id: customSectionId,
      custom_section_name: customSectionName,
      timezone,
      nowISO,
    };
    startTransition(async () => {
      const res = await logFromText(payload);
      if (res.ok) {
        setText("");
        setOk(res.summary);
        // Hide the inline confirmation after a beat.
        window.setTimeout(() => setOk(null), 4000);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <section>
      <h2 className="mb-2 px-1 text-eyebrow">
        {label}
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="rounded-2xl border border-line bg-surface-raised p-3 space-y-2"
      >
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
            setOk(null);
          }}
          placeholder={placeholder}
          rows={rows}
          className="block w-full resize-none rounded-xl bg-canvas/40 px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint outline-none transition-base focus:bg-canvas"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-ink-faint">
            {pending
              ? "Reading…"
              : error
                ? <span className="text-claret">{error}</span>
                : ok
                  ? <span className="text-ink-muted">{ok}</span>
                  : "⌘ + Enter to log."}
          </p>
          <button
            type="submit"
            disabled={pending || text.trim().length === 0}
            className="cta inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink px-3 text-[12.5px] text-surface transition-base hover:bg-ink-soft disabled:cursor-default disabled:opacity-40"
          >
            {pending ? "Logging" : "Log"}
            <ArrowRightIcon size={11} />
          </button>
        </div>
      </form>
    </section>
  );
}
