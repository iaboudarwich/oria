"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  executeSuggestion,
  declineSuggestion,
  commentOnSuggestion,
} from "@/lib/data/suggestion-actions";
import type { Suggestion } from "@/lib/daily/suggestions";
import { SparkIcon } from "@/components/ui/icon";

/**
 * The daily suggestion cards. Each is grounded in a real signal; Yes performs
 * the real write server-side, No dismisses it for good, Comment lets the user
 * steer in their own words. Cards disappear optimistically on Yes/No.
 */
export function SuggestionList({
  suggestions,
  organizationId,
}: {
  suggestions: Suggestion[];
  organizationId: string;
}) {
  const t = useTranslations("suggestions");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = suggestions.filter((s) => !hidden.has(s.key));
  if (visible.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[13px] font-medium text-ink-muted">{t("section_title")}</h2>
      <ul className="space-y-2">
        {visible.map((s) => (
          <SuggestionCard
            key={s.key}
            suggestion={s}
            organizationId={organizationId}
            onGone={() => setHidden((prev) => new Set(prev).add(s.key))}
          />
        ))}
      </ul>
    </section>
  );
}

function SuggestionCard({
  suggestion,
  organizationId,
  onGone,
}: {
  suggestion: Suggestion;
  organizationId: string;
  onGone: () => void;
}) {
  const t = useTranslations("suggestions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState("");

  const params = suggestion.params;
  const title = t(`${suggestion.pattern}_title`, params);
  const detail = t(`${suggestion.pattern}_detail`, params);

  function yes() {
    onGone();
    startTransition(async () => {
      await executeSuggestion({
        key: suggestion.key,
        pattern: suggestion.pattern,
        action: suggestion.action,
        organizationId,
      });
      router.refresh();
    });
  }

  function no() {
    onGone();
    startTransition(async () => {
      await declineSuggestion({
        key: suggestion.key,
        pattern: suggestion.pattern,
        organizationId,
      });
      router.refresh();
    });
  }

  function sendComment() {
    const text = comment.trim();
    setCommenting(false);
    setComment("");
    if (!text) return;
    startTransition(async () => {
      await commentOnSuggestion({
        key: suggestion.key,
        pattern: suggestion.pattern,
        comment: text,
        organizationId,
      });
    });
  }

  return (
    <li className="rounded-2xl border border-line bg-surface-raised px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-brand" aria-hidden>
          <SparkIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-ink">{title}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">{detail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setCommenting((v) => !v)}
            disabled={pending}
            className="text-[12.5px] text-ink-faint transition-base hover:text-ink disabled:opacity-50"
          >
            {t("comment")}
          </button>
          <button
            type="button"
            onClick={no}
            disabled={pending}
            className="text-[12.5px] text-ink-faint transition-base hover:text-ink disabled:opacity-50"
          >
            {t("no")}
          </button>
          <button
            type="button"
            onClick={yes}
            disabled={pending}
            className="rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface transition-base hover:bg-ink-soft disabled:opacity-50"
          >
            {t("yes")}
          </button>
        </div>
      </div>
      {commenting ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t("comment_placeholder")}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink outline-none focus:border-brand"
            onKeyDown={(e) => {
              if (e.key === "Enter") sendComment();
            }}
          />
          <button
            type="button"
            onClick={sendComment}
            disabled={pending}
            className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-ink transition-base hover:bg-surface disabled:opacity-50"
          >
            {t("comment_send")}
          </button>
        </div>
      ) : null}
    </li>
  );
}
