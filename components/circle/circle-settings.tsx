"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSpace, leaveCircle } from "@/lib/data/space-actions";
import { transferOwnership } from "@/lib/data/member-access-actions";

type Candidate = {
  membership_id: string;
  name: string;
  email: string;
};

/**
 * The space-settings group (shown for circles AND workspaces): a quiet card
 * holding transfer-ownership, leave, and delete. Each destructive action uses
 * a two-step reveal so it can't be fired with a single accidental tap. The
 * noun adapts to the space kind.
 */
export function CircleSettings({
  circleName,
  isOwner,
  isSoloOwner,
  isWorkspace,
  candidates,
}: {
  circleName: string;
  isOwner: boolean;
  isSoloOwner: boolean;
  isWorkspace: boolean;
  candidates: Candidate[];
}) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-eyebrow">
        {isWorkspace ? "Workspace settings" : "Circle settings"}
      </h2>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-[0_1px_2px_rgba(28,26,23,0.04),0_2px_8px_-6px_rgba(28,26,23,0.08)]">
        <ul className="divide-y divide-line">
          {isOwner && candidates.length > 0 ? (
            <TransferRow candidates={candidates} />
          ) : null}
          {!isOwner ? (
            <LeaveRow circleName={circleName} isWorkspace={isWorkspace} />
          ) : null}
          {isOwner && isSoloOwner ? (
            <LeaveRow circleName={circleName} isWorkspace={isWorkspace} solo />
          ) : null}
          {isOwner ? (
            <DeleteRow circleName={circleName} isWorkspace={isWorkspace} />
          ) : null}
        </ul>
      </div>
    </section>
  );
}

function Row({
  title,
  body,
  control,
  expanded,
}: {
  title: string;
  body: string;
  control: React.ReactNode;
  expanded?: React.ReactNode;
}) {
  return (
    <li className="px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] text-ink">{title}</p>
          <p className="text-[12px] text-ink-faint">{body}</p>
        </div>
        <div className="shrink-0">{control}</div>
      </div>
      {expanded ? <div className="mt-3">{expanded}</div> : null}
    </li>
  );
}

function TransferRow({ candidates }: { candidates: Candidate[] }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(candidates[0]?.membership_id ?? "");

  return (
    <Row
      title="Transfer ownership"
      body="Make someone else the owner. You'll become a full member."
      control={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-[12px] text-ink-soft transition-base hover:border-line-strong hover:text-ink"
        >
          {open ? "Cancel" : "Transfer"}
        </button>
      }
      expanded={
        open ? (
          <form
            action={transferOwnership}
            className="flex flex-col gap-2 rounded-xl border border-line bg-canvas/60 p-3 sm:flex-row sm:items-center"
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11.5px] text-ink-muted">
                Who should be the new owner?
              </span>
              <select
                name="membership_id"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink outline-none transition-base focus:border-ink"
              >
                {candidates.map((c) => (
                  <option key={c.membership_id} value={c.membership_id}>
                    {c.name} ({c.email})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-ink px-3.5 text-[12.5px] text-surface hover:bg-ink-soft transition-base"
            >
              Make them the owner
            </button>
          </form>
        ) : null
      }
    />
  );
}

function LeaveRow({
  circleName,
  isWorkspace,
  solo,
}: {
  circleName: string;
  isWorkspace: boolean;
  solo?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const noun = isWorkspace ? "workspace" : "circle";

  return (
    <Row
      title={solo ? `Close this ${noun}` : `Leave this ${noun}`}
      body={
        solo
          ? `You're the only one here. Leaving will close the ${noun}.`
          : "Stop seeing what's shared here. The owner can re-invite you."
      }
      control={
        armed ? (
          <form action={leaveCircle} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="inline-flex h-8 items-center rounded-lg border border-line bg-surface px-2.5 text-[11.5px] text-ink-muted hover:text-ink transition-base"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex h-8 items-center rounded-lg bg-claret/90 px-3 text-[12px] text-surface hover:bg-claret transition-base"
            >
              {solo ? `Close ${truncate(circleName)}` : "Yes, leave"}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setArmed(true)}
            className="inline-flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-[12px] text-ink-soft transition-base hover:border-line-strong hover:text-ink"
          >
            {solo ? "Close" : "Leave"}
          </button>
        )
      }
    />
  );
}

function DeleteRow({
  circleName,
  isWorkspace,
}: {
  circleName: string;
  isWorkspace: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const noun = isWorkspace ? "workspace" : "circle";
  const matches = typed.trim().toLowerCase() === circleName.trim().toLowerCase();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!matches || pending) return;
    setError(null);
    const fd = new FormData();
    fd.set("confirm_name", typed);
    startTransition(async () => {
      const res = await deleteSpace(fd);
      if (res.ok) {
        // The active space is gone; land back on the dashboard (which falls
        // back to Personal) and evict any cached prior-space data.
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      setError(
        res.reason === "name_mismatch"
          ? "That name didn't match. Check the spelling and try again."
          : `We couldn't delete this ${noun}. Try again in a moment.`,
      );
    });
  }

  return (
    <Row
      title={`Delete this ${noun}`}
      body={`Removes the ${noun}, its members, uploads, and reminders. This can't be undone.`}
      control={
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setTyped("");
            setError(null);
          }}
          className="inline-flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-[12px] text-ink-soft transition-base hover:border-line-strong hover:text-ink"
        >
          {open ? "Cancel" : "Delete"}
        </button>
      }
      expanded={
        open ? (
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-2 rounded-xl border border-claret/20 bg-claret/[0.04] p-3"
          >
            <label className="block">
              <span className="block text-[12px] text-ink-muted">
                Type the name to confirm
              </span>
              <input
                type="text"
                name="confirm_name"
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setError(null);
                }}
                placeholder={circleName}
                autoComplete="off"
                spellCheck={false}
                className="mt-1.5 block h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-claret"
              />
            </label>
            {error ? (
              <p role="alert" aria-live="assertive" className="text-[12px] text-claret">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={!matches || pending}
              aria-busy={pending}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-claret/90 px-3.5 text-[12.5px] text-surface transition-base hover:bg-claret disabled:opacity-40 disabled:hover:bg-claret/90"
            >
              {pending ? "Deleting…" : `Delete ${truncate(circleName)}`}
            </button>
          </form>
        ) : null
      }
    />
  );
}

function truncate(s: string, max = 28): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
