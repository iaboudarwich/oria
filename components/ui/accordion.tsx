"use client";

import { useState } from "react";
import { ChevronDownIcon } from "@/components/ui/icon";

/**
 * Simple single-section accordion. Pass defaultOpen to start expanded.
 * Used on the upload detail page to collapse secondary panels.
 */
export function Accordion({
  label,
  defaultOpen = false,
  badge,
  children,
}: {
  label: string;
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
        className="flex w-full items-center justify-between px-1 py-1 text-left transition-base hover:opacity-80"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
            {label}
          </span>
          {badge != null ? (
            <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[10px] text-ink-faint border border-line">
              {badge}
            </span>
          ) : null}
        </span>
        <span
          className={`text-ink-faint transition-transform duration-150 ${
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
