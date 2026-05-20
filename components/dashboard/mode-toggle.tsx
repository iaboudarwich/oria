"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { switchMode } from "@/lib/data/mode-actions";
import type { Mode } from "@/lib/data/mode";

/**
 * Pill bar at the very top of the sidebar. Two states only: Personal and
 * Work. Clicking the inactive pill flips an optimistic local state so the
 * highlight moves immediately, then fires a server action that sets the
 * active-space cookie and returns the href to navigate to. The client does
 * the routing via router.push so there's no server-redirect flash.
 *
 * Quiet by default: the unselected pill is text-only; only the active pill
 * fills, so the toggle reads as a calm context cue rather than a heavy
 * control.
 */
export function ModeToggle({ active }: { active: Mode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  // Optimistic override: set on click, cleared during render once reality
  // catches up. Drives the highlight so it never lags behind the user.
  const [optimistic, setOptimistic] = useState<Mode | null>(null);

  // React 19 idiom: reset derived state during render when the underlying
  // input changes. Cheaper and more predictable than useEffect.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  //
  // Two ways the optimistic flag becomes stale:
  //   1) The real `active` prop caught up (cookie flipped, layout re-rendered).
  //   2) The user navigated to a path that contradicts the optimistic intent
  //      (e.g., clicked Work with no workspace, landed on /dashboard/work/
  //      spaces/new, then cancelled back to /dashboard).
  if (optimistic) {
    const inWorkPath = pathname.startsWith("/dashboard/work");
    const expectingWork = optimistic === "work";
    const reconciled = active === optimistic || expectingWork !== inWorkPath;
    if (reconciled) {
      setOptimistic(null);
    }
  }

  const displayed = optimistic ?? active;

  function switchTo(mode: Mode) {
    if (mode === displayed) return;
    if (isPending) return;
    setOptimistic(mode);
    startTransition(async () => {
      const result = await switchMode(mode);
      if (result.ok) {
        router.push(result.href);
        router.refresh();
      } else {
        setOptimistic(null);
      }
    });
  }

  return (
    <div className="mx-3 inline-flex w-[calc(100%-1.5rem)] rounded-lg border border-line bg-canvas/60 p-0.5">
      <ModePill
        label="Personal"
        active={displayed === "personal"}
        onClick={() => switchTo("personal")}
      />
      <ModePill
        label="Work"
        active={displayed === "work"}
        onClick={() => switchTo("work")}
      />
    </div>
  );
}

function ModePill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-md py-1 text-[12px] transition-base ${
        active
          ? "bg-surface-raised text-ink shadow-[0_1px_2px_rgba(28,26,23,0.06)]"
          : "text-ink-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
