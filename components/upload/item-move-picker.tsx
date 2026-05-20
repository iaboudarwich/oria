"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setItemSection } from "@/lib/data/item-actions";
import { ChevronDownIcon } from "@/components/ui/icon";
import { useDismissable } from "@/lib/hooks/use-dismissable";
import { MoveMenu } from "./move-menu";

type SectionItem = {
  ref: { kind: "builtin" | "custom" | "review"; key: string };
  name: string;
};

type Props = {
  itemId: string;
  currentRef: { kind: "builtin" | "custom" | "review"; key: string };
  sections: SectionItem[];
};

/**
 * Per-item section picker for multi-receipt uploads. Same UX language as the
 * MovePicker used for full uploads, just bound to setItemSection so each
 * receipt in a batch can land in a different section.
 */
export function ItemMovePicker({ itemId, currentRef, sections }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { ref, open, setOpen, toggle } = useDismissable<HTMLDivElement>();

  function move(kind: string, key: string) {
    const fd = new FormData();
    fd.set("item_id", itemId);
    fd.set("target_kind", kind);
    fd.set("target_key", key);
    setOpen(false);
    startTransition(async () => {
      await setItemSection(fd);
      router.refresh();
    });
  }

  const isReview = currentRef.kind === "review";
  const currentLabel =
    sections.find(
      (s) => s.ref.kind === currentRef.kind && s.ref.key === currentRef.key,
    )?.name ?? (isReview ? "Unsorted" : "Move");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        disabled={pending}
        className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11.5px] transition-base disabled:opacity-50 ${
          open
            ? "border-line-strong bg-canvas text-ink"
            : isReview
              ? "border-accent-soft bg-accent-soft/50 text-[#7a5a2a] hover:border-accent"
              : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink"
        }`}
      >
        {pending ? "Moving" : currentLabel}
        <ChevronDownIcon
          size={11}
          className={`transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <MoveMenu
          sections={sections}
          currentRef={currentRef}
          onMove={move}
          width={220}
          maxHeight={300}
        />
      ) : null}
    </div>
  );
}
