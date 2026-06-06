"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { switchMode } from "@/lib/data/mode-actions";
import type { Mode } from "@/lib/data/mode";

/**
 * Pill bar at the very top of the sidebar. Two states only: Personal and
 * Work. Highlight rules, in order:
 *
 *   1. If the user just clicked, show their intent (optimistic). even
 *      across multiple re-renders.
 *   2. Once "settled" (pathname + active cookie) matches that intent,
 *      drop the optimistic flag. We only drop it when reality has caught
 *      up; if we dropped it earlier we'd briefly show the stale truth
 *      (the famous Personal→Work→Personal flash).
 *   3. With no optimistic intent, the path beats the cookie: any
 *      /dashboard/work URL is Work, everything else follows `active`.
 *
 * Buttons get `cursor-pointer` explicitly because Tailwind v4 dropped the
 * preflight that used to set it on <button>. Keyboard activation (Space /
 * Enter) and aria-pressed are inherited from the native button element.
 */
export function ModeToggle({ active }: { active: Mode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<Mode | null>(null);

  // Prefetch both mode homes so the push after a click is instant.
  useEffect(() => {
    router.prefetch("/dashboard");
    router.prefetch("/dashboard/work");
  }, [router]);

  const onWorkPath = pathname.startsWith("/dashboard/work");
  const settled: Mode = onWorkPath ? "work" : active;

  // Reality-catch-up, done during render (React 19 idiom for "store info
  // from previous renders"). The setOptimistic call schedules a re-render;
  // React discards this in-flight render, so the user never sees a flash.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (optimistic !== null && optimistic === settled) {
    setOptimistic(null);
  }

  const displayed: Mode = optimistic ?? settled;

  function switchTo(mode: Mode) {
    if (mode === displayed) return;
    setOptimistic(mode);
    startTransition(async () => {
      const result = await switchMode(mode);
      if (!result.ok) {
        // Action failed; revert immediately so the toggle reflects truth.
        setOptimistic(null);
        return;
      }
      router.push(result.href);
      // Intentionally do NOT clear optimistic here. the useEffect above
      // clears it when `settled` confirms the new state. Clearing now
      // would flash the old highlight while pathname/active catch up.
    });
  }

  return (
    <div
      role="tablist"
      aria-label="Switch mode"
      className="mx-3 inline-flex w-[calc(100%-1.5rem)] rounded-lg border border-line bg-canvas/60 p-0.5"
    >
      <ModePill
        label="Personal"
        active={displayed === "personal"}
        onClick={() => switchTo("personal")}
      />
      <ModePill label="Work" active={displayed === "work"} onClick={() => switchTo("work")} />
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
      role="tab"
      onClick={onClick}
      aria-selected={active}
      className={`transition-base flex-1 cursor-pointer rounded-md py-1 text-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
        active
          ? "bg-surface-raised text-ink shadow-[0_1px_2px_rgba(28,26,23,0.06)]"
          : "text-ink-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
