"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "@/lib/data/account-actions";

const PHRASE = "delete my account";

/**
 * Destructive panel kept far from everything else and gated by a typed
 * confirmation. Mirrors the calm voice of the rest of Settings; the only
 * destructive cue is the claret button colour.
 */
export function DeleteAccountPanel() {
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
      const result = await deleteAccount(fd);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <section>
      <div className="mb-2 px-1">
        <h2 className="text-eyebrow">Danger zone</h2>
        <p className="mt-1 text-[12px] text-ink-faint">
          Deleting your account is permanent. Spaces where you&apos;re the sole member are removed
          along with their uploads.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-[0_1px_2px_rgba(28,26,23,0.04),0_2px_8px_-6px_rgba(28,26,23,0.08)]">
        {!open ? (
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-[13px] text-ink">Delete account</p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="transition-base inline-flex h-8 items-center rounded-md border border-claret/30 px-3 text-[12px] font-medium text-claret hover:bg-claret/5"
            >
              Begin
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 px-4 py-3">
            <p className="text-[13px] text-ink">
              Type <span className="font-medium text-ink">&ldquo;{PHRASE}&rdquo;</span> to confirm.
            </p>
            <input
              type="text"
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
                setError(null);
              }}
              placeholder={PHRASE}
              className="block h-9 w-full rounded-md bg-canvas/60 px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:bg-canvas"
              autoFocus
            />
            {error ? <p className="text-[11.5px] text-claret">{error}</p> : null}
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
                className="transition-base inline-flex h-8 items-center rounded-md bg-claret px-3 text-[12px] text-surface hover:opacity-90 disabled:opacity-40"
              >
                {pending ? "Deleting" : "Delete forever"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
