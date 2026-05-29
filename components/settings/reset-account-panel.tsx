"use client";

import { useState, useTransition } from "react";
import { resetAccount } from "@/lib/data/account-actions";

const PHRASE = "reset my account";

/**
 * Warning-zone panel (amber, not claret) that wipes all user-generated
 * content but preserves the account itself. Sits above the danger-zone
 * delete panel in Settings.
 */
export function ResetAccountPanel() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ready = confirmation.trim().toLowerCase() === PHRASE;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready || pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("confirmation", confirmation);
    startTransition(async () => {
      const result = await resetAccount(fd);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <section>
      <div className="mb-2 px-1">
        <h2 className="text-eyebrow">
          Reset account
        </h2>
        <p className="mt-1 text-[12px] text-ink-faint">
          Wipe all your uploads, reminders, conversations, and memory.
          Keep your account, profile, and shared circle memberships. This
          can&apos;t be undone.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-[0_1px_2px_rgba(28,26,23,0.04),0_2px_8px_-6px_rgba(28,26,23,0.08)]">
        {!open ? (
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-[13px] text-ink">Reset account to zero</p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-[11.5px] text-amber-600 hover:underline"
            >
              Begin
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 px-4 py-3">
            <p className="text-[13px] text-ink">
              Type{" "}
              <span className="font-medium text-ink">&ldquo;{PHRASE}&rdquo;</span>{" "}
              to confirm. All your personal content will be permanently deleted.
            </p>
            <input
              type="text"
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
                setError(null);
              }}
              placeholder={PHRASE}
              className="block h-9 w-full rounded-md bg-canvas/60 px-2.5 text-[13px] text-ink placeholder:text-ink-faint outline-none focus:bg-canvas"
              autoFocus
            />
            {error ? (
              <p className="text-[11.5px] text-claret">{error}</p>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setConfirmation("");
                  setError(null);
                }}
                className="h-8 rounded-md px-3 text-[12px] text-ink-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!ready || pending}
                className="inline-flex h-8 items-center rounded-md border border-amber-400 bg-amber-50 px-3 text-[12px] text-amber-800 transition-base hover:bg-amber-100 disabled:opacity-40"
              >
                {pending ? "Resetting…" : "Reset everything"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
