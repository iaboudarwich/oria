"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyItemSortingInstruction } from "@/lib/data/item-actions";
import { ArrowRightIcon } from "@/components/ui/icon";
import { ItemMovePicker } from "./item-move-picker";
import type { MemoryItem, Section } from "@/lib/supabase/types";

type SectionItem = {
  ref: { kind: "builtin" | "custom" | "review"; key: string };
  name: string;
};

type Props = {
  uploadId: string;
  items: MemoryItem[];
  sections: SectionItem[];
  sectionLabels: Record<Section, string>;
  customNames: Record<string, string>;
};

/**
 * Multi-receipt review panel. One row per detected memory_item with an
 * inline section picker. A small natural-language sort input lives at the
 * top so the user can type "Hermès in Expenses, Spinneys in Groceries" and
 * Oria splits the work across rows in one shot.
 */
export function ItemReviewPanel({ uploadId, items, sections, sectionLabels, customNames }: Props) {
  const router = useRouter();
  const [instruction, setInstruction] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    { kind: "ok"; lines: string[] } | { kind: "err"; message: string } | null
  >(null);

  const sorted = items.filter((i) => i.section !== null || i.custom_section_id !== null).length;
  const unsorted = items.length - sorted;

  function submitInstruction() {
    const text = instruction.trim();
    if (!text) return;
    const fd = new FormData();
    fd.set("upload_id", uploadId);
    fd.set("instruction", text);
    startTransition(async () => {
      const result = await applyItemSortingInstruction(fd);
      if (result.ok) {
        setFeedback({
          kind: "ok",
          lines: result.applied.map((a) => `${a.title} → ${a.target}`),
        });
        setInstruction("");
        router.refresh();
      } else {
        setFeedback({ kind: "err", message: result.error });
      }
    });
  }

  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2 px-1">
        <h2 className="text-[13px] font-medium text-ink-muted">Detected items</h2>
        <span className="text-[11.5px] text-ink-faint">
          {items.length} found · {sorted} sorted
          {unsorted > 0 ? ` · ${unsorted} need sorting` : ""}
        </span>
      </div>

      {/* Natural-language sort */}
      <div className="mb-3 rounded-xl border border-line bg-surface-raised p-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitInstruction();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={instruction}
            onChange={(e) => {
              setInstruction(e.target.value);
              setFeedback(null);
            }}
            placeholder="Tell Oria where each one goes. e.g. ‘Hermès in Expenses, Spinneys in Groceries.’"
            className="block h-9 flex-1 rounded-md bg-canvas/60 px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:bg-canvas"
          />
          <button
            type="submit"
            disabled={pending || instruction.trim().length === 0}
            className="transition-base inline-flex h-9 items-center gap-1 rounded-md bg-ink px-3 text-[12.5px] text-surface hover:bg-ink-soft disabled:opacity-50"
          >
            {pending ? "Sorting" : "Apply"}
            <ArrowRightIcon size={12} />
          </button>
        </form>
        {feedback ? (
          <div className="mt-2 px-1">
            {feedback.kind === "ok" ? (
              <ul className="space-y-0.5 text-[11.5px] text-[#3f5240]">
                {feedback.lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[11.5px] text-claret">{feedback.message}</p>
            )}
          </div>
        ) : null}
      </div>

      {/* Item rows */}
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface-raised">
        {items.map((it) => (
          <ItemRow
            key={it.id}
            item={it}
            sections={sections}
            sectionLabels={sectionLabels}
            customNames={customNames}
          />
        ))}
      </ul>

      <p className="mt-2 px-1 text-[11px] text-ink-faint">
        Each row can go to a different section. The original image stays as the source.
      </p>
    </section>
  );
}

function ItemRow({
  item: it,
  sections,
  sectionLabels,
  customNames,
}: {
  item: MemoryItem;
  sections: SectionItem[];
  sectionLabels: Record<Section, string>;
  customNames: Record<string, string>;
}) {
  const isUnsorted = it.section === null && it.custom_section_id === null;
  const currentRef: { kind: "builtin" | "custom" | "review"; key: string } = it.section
    ? { kind: "builtin", key: it.section }
    : it.custom_section_id
      ? { kind: "custom", key: it.custom_section_id }
      : { kind: "review", key: "review" };
  const sectionName = it.section
    ? sectionLabels[it.section]
    : it.custom_section_id
      ? (customNames[it.custom_section_id] ?? "Custom")
      : "Unsorted";

  const amount =
    it.amount_value !== null
      ? it.amount_currency
        ? `${it.amount_value} ${it.amount_currency}`
        : it.amount_value
      : null;
  const date = it.occurred_at ? friendlyDate(new Date(it.occurred_at)) : null;

  return (
    <li className={`flex items-start gap-3 px-4 py-3 ${isUnsorted ? "bg-accent-soft/20" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] text-ink">{it.merchant || it.title}</p>
        <p className="truncate text-[11.5px] text-ink-faint">
          {[amount, date, it.location, sectionName].filter(Boolean).join(" · ")}
        </p>
      </div>
      <ItemMovePicker itemId={it.id} currentRef={currentRef} sections={sections} />
    </li>
  );
}

function friendlyDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
