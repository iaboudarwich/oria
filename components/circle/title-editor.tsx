"use client";

import { useState, useTransition } from "react";
import { setMemberTitle } from "@/lib/data/member-access-actions";

const CIRCLE_PRESETS = [
  "Wife",
  "Husband",
  "Family",
  "Partner",
  "Roommate",
  "Driver",
  "Cleaner",
  "Assistant",
];

const WORKSPACE_PRESETS = [
  "Property manager",
  "Lawyer",
  "Accountant",
  "Assistant",
  "Broker",
  "Analyst",
  "Tenant rep",
  "Contractor",
];

/**
 * Free-text role label that appears under the member name. Permission
 * scope is still controlled by access_level; this is for display so
 * Workspaces can read like a real org chart ("Lawyer", "Property
 * manager"). Owner-only.
 */
export function TitleEditor({
  membershipId,
  current,
  orgKind = "circle",
}: {
  membershipId: string;
  current: string | null;
  /** Drives the preset chips so a Workspace doesn't offer "Wife" and a
   *  Circle doesn't offer "Lawyer". */
  orgKind?: "personal" | "circle" | "office";
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ?? "");
  const [pending, startTransition] = useTransition();
  const presets = orgKind === "office" ? WORKSPACE_PRESETS : CIRCLE_PRESETS;
  const placeholder = orgKind === "office" ? "e.g. Property manager" : "e.g. Wife or Driver";

  function save(text: string) {
    const fd = new FormData();
    fd.set("membership_id", membershipId);
    fd.set("title", text);
    startTransition(async () => {
      await setMemberTitle(fd);
      setOpen(false);
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    save(value.trim());
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="transition-base cursor-pointer text-[11.5px] text-ink-muted hover:text-ink"
      >
        {current ? "Change title" : "Set title"}
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 space-y-2 rounded-lg border border-line bg-canvas/40 p-2"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        maxLength={60}
        className="block h-8 w-full rounded-md border border-line bg-surface-raised px-2.5 text-[12.5px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
        autoFocus
      />
      <ul className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => save(p)}
              disabled={pending}
              className="transition-base cursor-pointer rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-muted hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              {p}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="transition-base cursor-pointer text-[11.5px] text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="transition-base inline-flex h-7 cursor-pointer items-center rounded-md bg-ink px-2.5 text-[11.5px] text-surface hover:bg-ink-soft disabled:opacity-50"
        >
          {pending ? "Saving" : "Save"}
        </button>
      </div>
    </form>
  );
}
