"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  acceptSectionSuggestion,
  dismissSectionSuggestion,
} from "@/lib/sections/suggestion-actions";
import { SparkIcon } from "@/components/ui/icon";

type Suggestion = { id: string; name: string; itemType: string | null; count: number };

/**
 * Dashboard banner proposing a new section when Oria found a cluster of related
 * items that no existing section covers. One click creates the section (opted
 * into the item type) and retroactively routes the matched items into it.
 */
export function SectionSuggestionBanner({ suggestion }: { suggestion: Suggestion }) {
  const t = useTranslations("sectionSuggest");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [gone, setGone] = useState(false);

  if (gone) return null;

  function accept() {
    startTransition(async () => {
      await acceptSectionSuggestion(suggestion.id);
      router.refresh();
    });
  }

  function dismiss() {
    setGone(true);
    startTransition(async () => {
      await dismissSectionSuggestion(suggestion.id);
      router.refresh();
    });
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-raised px-4 py-3.5">
      <span className="mt-0.5 text-brand" aria-hidden>
        <SparkIcon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-ink">{t("title")}</p>
        <p className="mt-0.5 text-[12.5px] text-ink-muted">
          {t("body", { count: suggestion.count, name: suggestion.name })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={dismiss}
          disabled={pending}
          className="text-[12.5px] text-ink-faint transition-base hover:text-ink disabled:opacity-50"
        >
          {t("dismiss")}
        </button>
        <button
          type="button"
          onClick={accept}
          disabled={pending}
          className="rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface transition-base hover:bg-ink-soft disabled:opacity-50"
        >
          {t("create")}
        </button>
      </div>
    </div>
  );
}
