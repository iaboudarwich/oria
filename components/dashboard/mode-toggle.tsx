"use client";

import { useTransition } from "react";
import { switchMode } from "@/lib/data/mode-actions";
import type { Mode } from "@/lib/data/mode";

/**
 * Pill bar at the very top of the sidebar. Two states only: Personal and
 * Work. Clicking the inactive pill submits a server action that flips the
 * active-space cookie to the most-recent org of that mode and reloads.
 *
 * Quiet by default: the unselected pill is text-only; only the active pill
 * fills, so the toggle reads as a calm context cue rather than a heavy
 * control.
 */
export function ModeToggle({ active }: { active: Mode }) {
  const [pending, startTransition] = useTransition();

  function switchTo(mode: Mode) {
    if (mode === active) return;
    const fd = new FormData();
    fd.set("mode", mode);
    startTransition(async () => {
      await switchMode(fd);
    });
  }

  return (
    <div className="mx-3 inline-flex w-[calc(100%-1.5rem)] rounded-lg border border-line bg-canvas/60 p-0.5">
      <ModePill
        label="Personal"
        active={active === "personal"}
        disabled={pending}
        onClick={() => switchTo("personal")}
      />
      <ModePill
        label="Work"
        active={active === "work"}
        disabled={pending}
        onClick={() => switchTo("work")}
      />
    </div>
  );
}

function ModePill({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex-1 rounded-md py-1 text-[12px] transition-base disabled:opacity-60 ${
        active
          ? "bg-surface-raised text-ink shadow-[0_1px_2px_rgba(28,26,23,0.06)]"
          : "text-ink-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
