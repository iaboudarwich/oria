"use client";

import { useState } from "react";
import { ChevronDownIcon } from "@/components/ui/icon";

/**
 * Single-section disclosure (expand in place). Pass defaultOpen to start
 * expanded. `hint` is a one-line preview shown while collapsed so the header
 * always answers "what will I find if I expand this?" (Round 16.9 progressive
 * disclosure). Children mount only when open. Used to collapse dense secondary
 * content.
 */
export function Accordion({
  label,
  hint,
  defaultOpen = false,
  badge,
  children,
}: {
  label: string;
  hint?: string;
  defaultOpen?: boolean;
  badge?: string | number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-1 py-1 text-left transition-base hover:opacity-80"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="text-eyebrow">{label}</span>
            {badge != null ? (
              <span className="rounded-full border border-line bg-canvas px-1.5 py-0.5 text-[10px] text-ink-faint">
                {badge}
              </span>
            ) : null}
          </span>
          {hint && !open ? (
            <span className="mt-0.5 block truncate text-[11.5px] text-ink-faint">{hint}</span>
          ) : null}
        </span>
        <span
          className={`shrink-0 text-ink-faint transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        >
          <ChevronDownIcon size={12} />
        </span>
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </section>
  );
}
