"use client";

import { useState, useTransition } from "react";
import { acceptSuggestion, dismissSuggestion } from "@/lib/data/suggestion-actions";
import type { ReminderSuggestion } from "@/lib/ai/suggest-reminders";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function SuggestionRow({
  suggestion,
  uploadId,
  organizationId,
  onDone,
}: {
  suggestion: ReminderSuggestion;
  uploadId: string;
  organizationId: string;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "customize">("idle");
  const [leadDays, setLeadDays] = useState(suggestion.default_lead_days);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAccept(days: number) {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await acceptSuggestion({
        uploadId,
        organizationId,
        title: suggestion.title,
        targetDate: suggestion.target_date,
        leadDays: days,
      });
      if (result.ok) {
        onDone();
      } else {
        setError(result.error);
      }
    });
  }

  function handleDismiss() {
    if (pending) return;
    startTransition(async () => {
      await dismissSuggestion(suggestion.key);
      onDone();
    });
  }

  return (
    <div className="rounded-xl border border-line bg-canvas px-3 py-2.5">
      <p className="text-[13px] text-ink">{suggestion.title}</p>
      <p className="mt-0.5 text-[11.5px] text-ink-faint">{formatDate(suggestion.target_date)}</p>

      {mode === "idle" ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="mr-1 text-[11px] text-ink-faint">
            Notify {suggestion.default_lead_days}d before
          </p>
          <button
            type="button"
            onClick={() => handleAccept(suggestion.default_lead_days)}
            disabled={pending}
            className="transition-base inline-flex h-6 items-center rounded-md bg-ink px-2.5 text-[11px] text-surface hover:bg-ink-soft disabled:opacity-50"
          >
            {pending ? "Adding…" : "Yes"}
          </button>
          <button
            type="button"
            onClick={() => setMode("customize")}
            disabled={pending}
            className="transition-base inline-flex h-6 items-center rounded-md border border-line px-2.5 text-[11px] text-ink-muted hover:border-line-strong hover:text-ink"
          >
            Customize
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={pending}
            className="transition-base text-[11px] text-ink-faint hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-[11.5px] text-ink-faint">Notify</label>
            <input
              type="number"
              min={0}
              max={365}
              value={leadDays}
              onChange={(e) =>
                setLeadDays(Math.max(0, Math.min(365, parseInt(e.target.value, 10) || 0)))
              }
              className="w-16 rounded border border-line bg-canvas px-2 py-0.5 text-[12px] text-ink outline-none focus:border-ink-soft"
            />
            <span className="text-[11.5px] text-ink-faint">days before</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleAccept(leadDays)}
              disabled={pending}
              className="transition-base inline-flex h-6 items-center rounded-md bg-ink px-2.5 text-[11px] text-surface hover:bg-ink-soft disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add reminder"}
            </button>
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="text-[11px] text-ink-faint hover:text-ink"
            >
              Back
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-[11px] text-claret">{error}</p>}
    </div>
  );
}

export function SuggestedRemindersPanel({
  suggestions,
  uploadId,
  organizationId,
}: {
  suggestions: ReminderSuggestion[];
  uploadId: string;
  organizationId: string;
}) {
  const [visible, setVisible] = useState(suggestions);

  if (visible.length === 0) return null;

  function remove(key: string) {
    setVisible((prev) => prev.filter((s) => s.key !== key));
  }

  return (
    <section>
      <h2 className="text-eyebrow mb-2 px-1">Suggested reminders</h2>
      <div className="space-y-2">
        {visible.map((s) => (
          <SuggestionRow
            key={s.key}
            suggestion={s}
            uploadId={uploadId}
            organizationId={organizationId}
            onDone={() => remove(s.key)}
          />
        ))}
      </div>
    </section>
  );
}
