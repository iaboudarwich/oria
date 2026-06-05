"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Wordmark } from "@/components/brand/wordmark";
import { BuildingSpace } from "@/components/onboarding/building-space";
import { useFocusNext } from "@/lib/hooks/use-focus-next";
import { onboardingNextStep } from "../actions";
import type { Answer, ConversationState, EngineStep } from "@/lib/onboarding/types";

export const CONTEXT_STORAGE_KEY = "oria:onboarding:context";

type Question = Extract<EngineStep, { done: false }>["question"];

/**
 * Full-page adaptive onboarding conversation. Drives the ConversationEngine
 * (initial_setup), shows one question at a time with progress, allows skipping
 * a single question (not the whole flow), and hands the finished UserContext to
 * the preview via sessionStorage.
 */
export function ConversationClient() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [progress, setProgress] = useState({ current: 1, total: 6 });
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [building, setBuilding] = useState(false);
  const started = useRef(false);

  // When a new question appears, bring it into view and move focus to it. Text
  // questions keep the textarea autofocus (focus:false here so we do not steal
  // it); choice questions get the region focused so the next tap is right there.
  const isText = question?.type === "text";
  const regionRef = useFocusNext<HTMLDivElement>(question?.id, {
    enabled: !!question && !busy,
    focus: !isText,
  });

  function applyStep(step: EngineStep) {
    if (step.done) {
      setBuilding(true);
      try {
        sessionStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(step.userContext));
      } catch {
        // sessionStorage unavailable; the preview will regenerate from scratch
      }
      router.push("/onboarding/preview");
      return;
    }
    setQuestion(step.question);
    setProgress(step.progress);
    setDraft("");
    setSelected([]);
    setBusy(false);
  }

  // Load the first question once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void onboardingNextStep({ mode: "initial_setup", answers: [] }).then(applyStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function advance(answer: string, skipped: boolean) {
    if (!question || busy) return;
    const next: Answer[] = [
      ...answers,
      { questionId: question.id, question: question.text, answer, skipped },
    ];
    setAnswers(next);
    setBusy(true);
    setQuestion(null);
    const state: ConversationState = { mode: "initial_setup", answers: next };
    void onboardingNextStep(state).then(applyStep);
  }

  if (building) {
    return (
      <Shell>
        <BuildingSpace />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="w-full max-w-lg">
        <p className="mb-6 text-[12px] font-medium uppercase tracking-[0.08em] text-ink-faint">
          {t("conv_progress", { current: progress.current, total: progress.total })}
        </p>

        {busy || !question ? (
          <div className="flex items-center gap-3 py-8 text-ink-faint">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-ink" aria-hidden />
            <span className="text-[14px]">{t("conv_thinking")}</span>
          </div>
        ) : (
          <>
            <h1 className="text-[24px] font-semibold leading-snug tracking-tight text-ink text-balance sm:text-[28px]">
              {question.text}
            </h1>

            <div className="mt-6" ref={regionRef} aria-label={question.text}>
              {question.type === "multiple_choice" && question.options && question.multi ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2">
                    {question.options.map((opt) => {
                      const on = selected.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setSelected((prev) =>
                              prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt],
                            )
                          }
                          className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-left text-[14px] transition-base ${
                            on
                              ? "border-brand bg-brand-soft/50 text-ink"
                              : "border-line bg-surface-raised text-ink hover:border-line-strong hover:bg-surface"
                          }`}
                        >
                          <span
                            className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border text-[10px] ${
                              on ? "border-brand bg-brand text-surface" : "border-line-strong text-transparent"
                            }`}
                            aria-hidden
                          >
                            ✓
                          </span>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={selected.length === 0}
                    onClick={() => advance(selected.join(", "), false)}
                    className="mt-1 self-start rounded-xl bg-ink px-5 py-2.5 text-[14px] font-medium text-surface transition-base hover:bg-ink-soft disabled:opacity-40"
                  >
                    {t("conv_continue")}
                  </button>
                </div>
              ) : question.type === "multiple_choice" && question.options ? (
                <div className="flex flex-col gap-2">
                  {question.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => advance(opt, false)}
                      className="rounded-xl border border-line bg-surface-raised px-4 py-3 text-left text-[14px] text-ink transition-base hover:border-line-strong hover:bg-surface"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : question.type === "yes_no" ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => advance(t("conv_yes"), false)}
                    className="rounded-xl border border-line bg-surface-raised px-5 py-3 text-[14px] font-medium text-ink transition-base hover:bg-surface"
                  >
                    {t("conv_yes")}
                  </button>
                  <button
                    type="button"
                    onClick={() => advance(t("conv_no"), false)}
                    className="rounded-xl border border-line bg-surface-raised px-5 py-3 text-[14px] font-medium text-ink transition-base hover:bg-surface"
                  >
                    {t("conv_no")}
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (draft.trim()) advance(draft.trim(), false);
                  }}
                >
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (draft.trim()) advance(draft.trim(), false);
                      }
                    }}
                    autoFocus
                    rows={3}
                    placeholder={t("conv_placeholder")}
                    className="w-full resize-none rounded-xl border border-line-strong bg-surface-raised px-4 py-3 text-[15px] text-ink outline-none transition-base focus:border-ink placeholder:text-ink-faint"
                  />
                  <button
                    type="submit"
                    disabled={!draft.trim()}
                    className="mt-3 rounded-xl bg-ink px-5 py-2.5 text-[14px] font-medium text-surface transition-base hover:bg-ink-soft disabled:opacity-40"
                  >
                    {t("conv_continue")}
                  </button>
                </form>
              )}
            </div>

            <button
              type="button"
              onClick={() => advance("", true)}
              className="mt-6 text-[12.5px] text-ink-faint transition-base hover:text-ink"
            >
              {t("conv_skip_one")}
            </button>
          </>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="px-6 py-5 sm:px-8">
        <Wordmark />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-16">{children}</main>
    </div>
  );
}
