"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setItemSection } from "@/lib/data/item-actions";
import {
  maybeOfferRoutingRule,
  confirmRoutingRule,
  suppressRoutingRule,
} from "@/lib/data/routing-rule-actions";
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

type Offer = { vendor: string; sectionKey: string; sectionName: string };

/**
 * Per-item section picker for multi-receipt uploads. After a manual move, Oria
 * may offer to learn the vendor->section rule (F1). The prompt is shown before
 * the list refreshes so it survives the item leaving the current view.
 */
export function ItemMovePicker({ itemId, currentRef, sections }: Props) {
  const t = useTranslations("learnRule");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { ref, open, setOpen, toggle } = useDismissable<HTMLDivElement>();
  const [offer, setOffer] = useState<Offer | null>(null);

  function move(kind: string, key: string) {
    const fd = new FormData();
    fd.set("item_id", itemId);
    fd.set("target_kind", kind);
    fd.set("target_key", key);
    setOpen(false);
    startTransition(async () => {
      await setItemSection(fd);
      // Offer to learn the rule only for real-section moves.
      if (kind === "builtin" || kind === "custom") {
        const result = await maybeOfferRoutingRule(itemId, key);
        if (result) {
          const sectionName =
            sections.find((s) => s.ref.kind === kind && s.ref.key === key)?.name ?? key;
          setOffer({ vendor: result.vendor, sectionKey: key, sectionName });
          return; // hold the refresh until the user answers
        }
      }
      router.refresh();
    });
  }

  function resolveOffer(action: "yes" | "no" | "later") {
    const current = offer;
    setOffer(null);
    startTransition(async () => {
      if (current && action === "yes") {
        await confirmRoutingRule(current.vendor, current.sectionKey);
      } else if (current && action === "no") {
        await suppressRoutingRule(current.vendor);
      }
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

      {offer ? (
        <div className="absolute right-0 top-9 z-30 w-64 rounded-xl border border-line bg-surface-raised p-3 shadow-xl animate-scale-in">
          <p className="text-[12px] text-ink-soft">
            {t("prompt", { vendor: offer.vendor, section: offer.sectionName })}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => resolveOffer("yes")}
              disabled={pending}
              className="rounded-lg bg-ink px-2.5 py-1 text-[11.5px] font-medium text-surface transition-base hover:bg-ink-soft disabled:opacity-50"
            >
              {t("yes")}
            </button>
            <button
              type="button"
              onClick={() => resolveOffer("no")}
              disabled={pending}
              className="rounded-lg border border-line-strong px-2.5 py-1 text-[11.5px] font-medium text-ink transition-base hover:bg-surface disabled:opacity-50"
            >
              {t("no")}
            </button>
            <button
              type="button"
              onClick={() => resolveOffer("later")}
              disabled={pending}
              className="ml-auto text-[11.5px] text-ink-faint transition-base hover:text-ink disabled:opacity-50"
            >
              {t("later")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
