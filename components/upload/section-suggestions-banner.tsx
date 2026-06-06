"use client";

import { useState, useTransition } from "react";
import {
  acceptSectionSuggestion,
  acceptAllSectionSuggestions,
} from "@/lib/data/section-auto-actions";
import { sectionLabel } from "@/lib/sections-meta";
import type { Section } from "@/lib/supabase/types";

export type SuggestionItem = {
  id: string;
  title: string;
  auto_section: string | null;
  auto_custom_section_id: string | null;
  auto_custom_section_name?: string | null;
};

export function SectionSuggestionsBanner({
  suggestions: initial,
}: {
  suggestions: SuggestionItem[];
}) {
  const [suggestions, setSuggestions] = useState(initial);
  const [, startTransition] = useTransition();

  if (suggestions.length === 0) return null;

  const sectionName = (s: SuggestionItem) =>
    s.auto_custom_section_name ??
    (s.auto_section ? sectionLabel(s.auto_section as Section) : null) ??
    "Unknown";

  function handleAccept(id: string) {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    startTransition(() => void acceptSectionSuggestion(id));
  }

  function handleAcceptAll() {
    setSuggestions([]);
    startTransition(async () => {
      await acceptAllSectionSuggestions();
    });
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-eyebrow">Suggested by Oria</h2>
        {suggestions.length > 1 && (
          <button
            type="button"
            onClick={handleAcceptAll}
            className="transition-base text-[11.5px] text-ink-muted hover:text-ink"
          >
            Accept all ({suggestions.length})
          </button>
        )}
      </div>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface-raised">
        {suggestions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-ink">{s.title}</p>
              <p className="text-[11.5px] text-ink-faint">Suggested: {sectionName(s)}</p>
            </div>
            <button
              type="button"
              onClick={() => handleAccept(s.id)}
              className="transition-base shrink-0 text-[11.5px] text-ink-muted hover:text-ink"
            >
              Move
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
