"use client";

import { useState } from "react";
import { setThingsLabel } from "@/lib/data/things-actions";

/**
 * Inline rename for the "Things" area label. Mirrors the section rename
 * mechanism: a quiet "Rename" affordance that expands to an input. Clearing
 * the field reverts to the per-template default.
 */
export function ThingsRename({ label }: { label: string }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[11.5px] text-ink-faint transition-base hover:text-ink"
      >
        Rename
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        setEditing(false);
        await setThingsLabel(fd);
      }}
      className="flex items-center gap-1.5"
    >
      <input
        name="label"
        defaultValue={label}
        autoFocus
        maxLength={40}
        className="h-7 w-36 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink outline-none focus:border-ink"
      />
      <button
        type="submit"
        className="shrink-0 rounded-md px-2 py-1 text-[11.5px] text-brand hover:opacity-80"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="shrink-0 text-[11.5px] text-ink-faint hover:text-ink"
      >
        Cancel
      </button>
    </form>
  );
}
