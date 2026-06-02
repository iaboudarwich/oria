"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { onboardingNextStep } from "@/app/onboarding/actions";
import { reshapeGeneratePlan, reshapeExecute } from "./actions";
import type { Answer, EngineStep, SetupPlan } from "@/lib/onboarding/types";

type Phase = "intent" | "asking" | "preview" | "building" | "error";
type Question = Extract<EngineStep, { done: false }>["question"];

/**
 * Reshape Oria with a short conversation (reconfigure mode). State a request,
 * answer one or two clarifying questions, review what will be created, confirm.
 * Additive by design; existing Settings handle deletions. 24h undo lives in
 * Settings -> Preferences.
 */
export function ReshapeClient({ initialIntent }: { initialIntent?: string }) {
  const t = useTranslations("reshape");
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(initialIntent ? "asking" : "intent");
  const [intent, setIntent] = useState(initialIntent ?? "");
  const [draft, setDraft] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [plan, setPlan] = useState<SetupPlan | null>(null);
  const startedFor = useRef<string | null>(null);

  function handleStep(step: EngineStep, theIntent: string, soFar: Answer[]) {
    if (step.done) {
      setPhase("preview");
      void reshapeGeneratePlan(step.userContext, theIntent).then(setPlan);
      return;
    }
    setQuestion(step.question);
    setAnswers(soFar);
  }

  // Kick off the conversation once an intent exists.
  useEffect(() => {
    if (phase !== "asking" || !intent || startedFor.current === intent) return;
    startedFor.current = intent;
    setQuestion(null);
    void onboardingNextStep({ mode: "reconfigure", answers: [], intent }).then((s) =>
      handleStep(s, intent, []),
    );
  }, [phase, intent]);

  function answer(value: string, skipped: boolean) {
    if (!question) return;
    const next: Answer[] = [...answers, { questionId: question.id, question: question.text, answer: value, skipped }];
    setQuestion(null);
    void onboardingNextStep({ mode: "reconfigure", answers: next, intent }).then((s) =>
      handleStep(s, intent, next),
    );
  }

  function build() {
    if (!plan) return;
    setPhase("building");
    void reshapeExecute(plan).then((r) => {
      if (r.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setPhase("error");
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg py-2 animate-fade-up">
      <h1 className="text-title text-ink">{t("title")}</h1>
      <p className="mt-1 text-[13px] text-ink-muted">{t("subtitle")}</p>

      <div className="mt-6">
        {phase === "intent" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) {
                setIntent(draft.trim());
                setPhase("asking");
              }
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              rows={3}
              placeholder={t("intent_placeholder")}
              className="w-full resize-none rounded-xl border border-line-strong bg-surface-raised px-4 py-3 text-[15px] text-ink outline-none transition-base focus:border-ink placeholder:text-ink-faint"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="mt-3 rounded-xl bg-ink px-5 py-2.5 text-[14px] font-medium text-surface transition-base hover:bg-ink-soft disabled:opacity-40"
            >
              {t("intent_go")}
            </button>
          </form>
        ) : phase === "asking" ? (
          question ? (
            <div>
              <h2 className="text-[18px] font-semibold text-ink text-balance">{question.text}</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim()) {
                    answer(draft.trim(), false);
                    setDraft("");
                  }
                }}
              >
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoFocus
                  rows={2}
                  placeholder={t("answer_placeholder")}
                  className="mt-3 w-full resize-none rounded-xl border border-line-strong bg-surface-raised px-4 py-3 text-[15px] text-ink outline-none transition-base focus:border-ink placeholder:text-ink-faint"
                />
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="submit"
                    className="rounded-xl bg-ink px-5 py-2 text-[14px] font-medium text-surface transition-base hover:bg-ink-soft"
                  >
                    {t("answer_continue")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      answer("", true);
                      setDraft("");
                    }}
                    className="text-[12.5px] text-ink-faint transition-base hover:text-ink"
                  >
                    {t("answer_skip")}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <Spinner label={t("thinking")} />
          )
        ) : phase === "preview" ? (
          plan ? (
            plan.spaces.length === 0 ? (
              <div>
                <p className="text-[14px] text-ink-soft">{t("nothing")}</p>
                <button
                  type="button"
                  onClick={() => {
                    setPlan(null);
                    setAnswers([]);
                    setDraft("");
                    startedFor.current = null;
                    setPhase("intent");
                  }}
                  className="mt-3 rounded-xl border border-line-strong px-4 py-2 text-[13px] font-medium text-ink transition-base hover:bg-surface"
                >
                  {t("try_again")}
                </button>
              </div>
            ) : (
              <div>
                <p className="text-[12.5px] font-medium text-ink-muted">{t("will_create")}</p>
                <div className="mt-2 space-y-2">
                  {plan.spaces.flatMap((s) =>
                    s.workspaces.map((w, i) => (
                      <div key={`${s.label}-${i}`} className="rounded-2xl border border-line bg-surface-raised p-4">
                        <p className="text-[14px] font-semibold text-ink">{w.name}</p>
                        {w.sections.length ? (
                          <p className="mt-1 text-[12.5px] text-ink-muted">
                            {w.sections.map((sec) => sec.title).join(", ")}
                          </p>
                        ) : null}
                      </div>
                    )),
                  )}
                </div>
                <button
                  type="button"
                  onClick={build}
                  className="mt-5 w-full rounded-xl bg-ink px-5 py-3 text-[15px] font-medium text-surface transition-base hover:bg-ink-soft"
                >
                  {t("confirm")}
                </button>
              </div>
            )
          ) : (
            <Spinner label={t("designing")} />
          )
        ) : phase === "building" ? (
          <Spinner label={t("building")} />
        ) : (
          <p className="rounded-lg border border-claret/30 bg-claret/5 px-3 py-2 text-[12.5px] text-claret">
            {t("error")}
          </p>
        )}
      </div>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-6 text-ink-faint">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-ink" aria-hidden />
      <span className="text-[14px]">{label}</span>
    </div>
  );
}
