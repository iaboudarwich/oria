"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { dismissRolloverCard } from "@/lib/daily/today-actions";
import { RotateIcon, CloseIcon } from "@/components/ui/icon";
import type { RolloverCard } from "@/lib/daily/today-data";

/**
 * F6: items carried forward from yesterday. Each links to its source; the X
 * dismisses it from Today (it does not complete the underlying reminder).
 */
export function RolloverCards({ cards }: { cards: RolloverCard[] }) {
  const t = useTranslations("dailyLoop");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = cards.filter((c) => !hidden.has(c.id));
  if (visible.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[13px] font-medium text-ink-muted">{t("carried_label")}</h2>
      <ul className="space-y-0.5">
        {visible.map((c) => (
          <RolloverRow
            key={c.id}
            card={c}
            onGone={() => setHidden((prev) => new Set(prev).add(c.id))}
          />
        ))}
      </ul>
    </section>
  );
}

function RolloverRow({ card, onGone }: { card: RolloverCard; onGone: () => void }) {
  const t = useTranslations("dailyLoop");
  const router = useRouter();
  const [, startTransition] = useTransition();

  function dismiss() {
    onGone();
    startTransition(async () => {
      await dismissRolloverCard(card.id);
      router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-3 rounded-lg px-3 py-2 transition-base hover:bg-surface-raised">
      <span className="text-ink-faint" aria-hidden>
        <RotateIcon size={14} />
      </span>
      <Link href={card.href} className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
        {card.title}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("carried_dismiss")}
        className="shrink-0 text-ink-faint transition-base hover:text-ink"
      >
        <CloseIcon size={16} />
      </button>
    </li>
  );
}
