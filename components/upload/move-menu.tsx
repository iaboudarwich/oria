"use client";

import { InboxIcon, TagIcon } from "@/components/ui/icon";

type SectionItem = {
  ref: { kind: "builtin" | "custom" | "review"; key: string };
  name: string;
};

type Props = {
  sections: SectionItem[];
  currentRef: { kind: "builtin" | "custom" | "review"; key: string };
  onMove: (kind: string, key: string) => void;
  width?: number;
  maxHeight?: number;
};

/**
 * Shared dropdown body for move/section pickers. Renders the section list,
 * a divider, and a "Move to Unsorted" affordance (hidden if already there).
 * The caller owns the trigger button and dismissable ref/state.
 */
export function MoveMenu({
  sections,
  currentRef,
  onMove,
  width = 240,
  maxHeight = 360,
}: Props) {
  const isReview = currentRef.kind === "review";
  return (
    <div
      role="menu"
      style={{ width, maxHeight }}
      className="absolute right-0 top-full z-30 mt-1.5 overflow-y-auto rounded-xl border border-line bg-surface-raised shadow-[0_10px_30px_-15px_rgba(28,26,23,0.20)] animate-fade-up"
    >
      <ul className="py-1.5">
        {sections.map((s) => {
          const active =
            s.ref.kind === currentRef.kind && s.ref.key === currentRef.key;
          const Icon = s.ref.kind === "review" ? InboxIcon : TagIcon;
          return (
            <li key={`${s.ref.kind}-${s.ref.key}`}>
              <button
                type="button"
                onClick={() => onMove(s.ref.kind, s.ref.key)}
                disabled={active}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-base ${
                  active
                    ? "text-ink-faint cursor-default"
                    : "text-ink-soft hover:bg-canvas hover:text-ink"
                }`}
              >
                <Icon size={13} />
                <span className="flex-1 truncate">{s.name}</span>
                {active ? (
                  <span className="text-[10.5px] text-ink-faint">Current</span>
                ) : null}
              </button>
            </li>
          );
        })}
        {!isReview ? (
          <>
            <li className="my-1 h-px bg-line" />
            <li>
              <button
                type="button"
                onClick={() => onMove("review", "review")}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink-muted transition-base hover:bg-canvas hover:text-ink"
              >
                <InboxIcon size={13} />
                <span className="flex-1 truncate">Move to Unsorted</span>
              </button>
            </li>
          </>
        ) : null}
      </ul>
    </div>
  );
}
