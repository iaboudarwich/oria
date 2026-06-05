"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchSpace } from "@/lib/data/space-actions";

export type SpaceChip = { id: string; label: string; kind: string };

/**
 * The per-space switch, presented as a chip row on the home (a re-lay-out of the
 * existing sidebar SpaceSwitcher, same `switchSpace` action). The active space
 * is highlighted; tapping another switches context and refreshes. Each non-active
 * chip carries a small hue dot by kind so the row reads at a glance. RTL-safe
 * (logical flex, no directional glyphs). A true cross-space "All spaces"
 * aggregation is a separate feature (God's Eye), not built here.
 */
export function SpaceChips({ spaces, activeId }: { spaces: SpaceChip[]; activeId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function go(id: string) {
    if (id === activeId || pending) return;
    startTransition(async () => {
      await switchSpace(id);
      router.refresh();
    });
  }

  function dot(kind: string): string {
    if (kind === "personal") return "var(--sleep)";
    if (kind === "circle") return "var(--spend)";
    return "var(--strain)";
  }

  if (spaces.length < 2) return null;

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5">
      {spaces.map((s) => {
        const on = s.id === activeId;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => go(s.id)}
            disabled={pending}
            aria-pressed={on}
            className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-[12.5px] transition-base disabled:opacity-60 ${
              on
                ? "border-ink bg-ink font-semibold text-canvas"
                : "border-line bg-surface text-ink-muted hover:text-ink"
            }`}
          >
            {!on ? (
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: dot(s.kind) }}
              />
            ) : null}
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
