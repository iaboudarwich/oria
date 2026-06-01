"use client";

import { useEffect, useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icon";
import { SECTION_META, CustomSectionIcon } from "@/lib/sections-meta";
import { deleteCustomSection } from "@/lib/data/custom-section-actions";
import {
  toggleSectionHidden,
  reorderSections,
  renameSection,
} from "@/lib/data/section-settings-actions";
import type { MergedSection } from "@/lib/data/all-sections";
import type { Section } from "@/lib/supabase/types";

/** Stable string id for a section ref. */
function refId(ref: { kind: string; key: string }) {
  return `${ref.kind}:${ref.key}`;
}

/** 6-dot drag-handle icon. */
function DragHandleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="4.5" cy="3" r="1.2" />
      <circle cx="4.5" cy="7" r="1.2" />
      <circle cx="4.5" cy="11" r="1.2" />
      <circle cx="9.5" cy="3" r="1.2" />
      <circle cx="9.5" cy="7" r="1.2" />
      <circle cx="9.5" cy="11" r="1.2" />
    </svg>
  );
}

/**
 * Section management list with drag-and-drop reordering.
 * Client component so DnD context can maintain local optimistic order.
 */
/** localStorage key for "has the user seen the drag-handle wiggle yet?".
 *  Set once on first reveal; subsequent visits skip the animation. */
const DRAG_HINT_KEY = "oria.drag_hint_shown";

export function SectionsEditor({
  sections: initial,
}: {
  sections: MergedSection[];
}) {
  const [sections, setSections] = useState(initial);
  const [, startTransition] = useTransition();
  // Wiggle gating. Starts off so SSR + first paint match (no hydration
  // mismatch); a client effect checks localStorage and flips it on once
  // per user, then writes the flag so it never fires again.
  //
  // The setState-in-effect lint rule wants pure derivations, but this
  // value is genuinely client-only (localStorage). the hydration-safe
  // alternative would be useSyncExternalStore, which is overkill for a
  // one-shot UI hint. Suppressing the rule is the right tradeoff here.
  const [wiggleHint, setWiggleHint] = useState(false);
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (window.localStorage.getItem(DRAG_HINT_KEY)) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWiggleHint(true);
      window.localStorage.setItem(DRAG_HINT_KEY, "1");
    } catch {
      // Safari private mode + locked-down browsers throw on localStorage.
      // silently skip the wiggle, nothing breaks.
    }
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex((s) => refId(s.ref) === active.id);
    const newIndex = sections.findIndex((s) => refId(s.ref) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sections, oldIndex, newIndex);
    setSections(reordered);
    startTransition(() => {
      void reorderSections(
        reordered.map((s) => ({ kind: s.ref.kind, key: s.ref.key })),
      );
    });
  }

  const ids = sections.map((s) => refId(s.ref));

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-[0_1px_2px_rgba(28,26,23,0.04),0_2px_8px_-6px_rgba(28,26,23,0.08)]">
          {sections.map((s, i) => (
            <SortableSectionRow
              key={refId(s.ref)}
              id={refId(s.ref)}
              section={s}
              wiggleHandle={wiggleHint && i === 0}
              onToggleHidden={(ref, hidden) => {
                setSections((prev) =>
                  prev.map((x) =>
                    refId(x.ref) === refId(ref) ? { ...x, hidden } : x,
                  ),
                );
              }}
              onRename={(ref, name) => {
                setSections((prev) =>
                  prev.map((x) =>
                    refId(x.ref) === refId(ref) ? { ...x, name } : x,
                  ),
                );
              }}
              onDelete={(ref) => {
                setSections((prev) =>
                  prev.filter((x) => refId(x.ref) !== refId(ref)),
                );
              }}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableSectionRow({
  id,
  section,
  onToggleHidden,
  onRename,
  onDelete,
  wiggleHandle = false,
}: {
  id: string;
  section: MergedSection;
  onToggleHidden: (ref: MergedSection["ref"], hidden: boolean) => void;
  onRename: (ref: MergedSection["ref"], name: string) => void;
  onDelete: (ref: MergedSection["ref"]) => void;
  /** When true, the drag handle plays a one-shot wiggle on mount to
   *  teach draggability. Gated upstream by a localStorage flag so the
   *  hint only fires once per user. */
  wiggleHandle?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const [renaming, setRenaming] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon =
    section.ref.kind === "builtin"
      ? SECTION_META[section.ref.key as Section].Icon
      : CustomSectionIcon;
  const isCustom = section.ref.kind === "custom";
  const canCustomize = section.ref.kind !== "review";

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        "flex items-center gap-2 px-2 py-2",
        section.hidden ? "opacity-55" : "",
        isDragging
          ? "z-10 scale-[1.02] rounded-xl border border-line bg-surface-raised shadow-md"
          : "transition-colors hover:bg-canvas/60",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Drag handle. only this element activates the drag. On a
          fresh visit the first row's handle wiggles once to teach the
          affordance (gated by localStorage upstream). */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className={`inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-md text-ink-faint transition-base hover:bg-canvas hover:text-ink active:cursor-grabbing ${
          wiggleHandle ? "drag-hint-wiggle" : ""
        }`}
      >
        <DragHandleIcon size={14} />
      </button>

      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-ink-muted">
        <Icon size={14} />
      </span>

      <div className="min-w-0 flex-1">
        {renaming ? (
          <form
            action={async (fd) => {
              const label = String(fd.get("label") ?? "").trim();
              if (label) onRename(section.ref, label);
              setRenaming(false);
              await renameSection(fd);
            }}
            className="flex items-center gap-1.5"
          >
            <input type="hidden" name="kind" value={section.ref.kind} />
            <input type="hidden" name="key" value={section.ref.key} />
            <input
              name="label"
              defaultValue={section.name}
              autoFocus
              maxLength={60}
              className="h-7 w-full rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink outline-none focus:border-ink"
            />
            <button
              type="submit"
              className="shrink-0 rounded-md px-2 py-1 text-[11.5px] text-brand hover:opacity-80"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setRenaming(false)}
              className="shrink-0 text-[11.5px] text-ink-faint hover:text-ink"
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <p className="truncate text-[13.5px] text-ink">{section.name}</p>
            <p className="text-[11.5px] text-ink-faint">
              {section.ref.kind === "builtin" ? "Built in" : "Custom"}
              {section.hidden ? " · hidden" : ""}
            </p>
          </>
        )}
      </div>

      {canCustomize && !renaming ? (
        <>
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="text-[11.5px] text-ink-muted hover:text-ink transition-base"
          >
            Rename
          </button>
          <HideButton
            target={section.ref}
            hidden={section.hidden}
            onOptimistic={(hidden) => onToggleHidden(section.ref, hidden)}
          />
        </>
      ) : null}

      {isCustom && !renaming ? (
        <form
          action={async (fd) => {
            onDelete(section.ref);
            await deleteCustomSection(fd);
          }}
        >
          <input type="hidden" name="id" value={section.ref.key} />
          <button
            type="submit"
            className="text-[11.5px] text-ink-faint hover:text-claret transition-base"
          >
            Remove
          </button>
        </form>
      ) : null}
    </li>
  );
}

function HideButton({
  target,
  hidden,
  onOptimistic,
}: {
  target: { kind: string; key: string };
  hidden: boolean;
  onOptimistic: (hidden: boolean) => void;
}) {
  return (
    <form
      action={async (fd) => {
        onOptimistic(!hidden);
        await toggleSectionHidden(fd);
      }}
    >
      <input type="hidden" name="kind" value={target.kind} />
      <input type="hidden" name="key" value={target.key} />
      <button
        type="submit"
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] text-ink-muted transition-base hover:bg-canvas hover:text-ink"
        aria-label={hidden ? "Show section" : "Hide section"}
      >
        {hidden ? <EyeIcon size={12} /> : <EyeOffIcon size={12} />}
        {hidden ? "Show" : "Hide"}
      </button>
    </form>
  );
}
