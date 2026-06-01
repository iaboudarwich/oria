"use client";

import { useEffect, useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MicButton } from "@/components/ui/mic-button";
import {
  continueOnboarding,
  applyOnboarding,
  skipOnboarding,
} from "@/lib/data/guided-onboarding-actions";
import type { OnboardingAIResponse, OnboardingSuggestions } from "@/lib/ai/guided-onboarding";
import { useLocale } from "next-intl";
import type { Locale } from "@/i18n/config";

type ChatMessage = { role: "user" | "assistant"; content: string };

type Screen = "conversation" | "review" | "done";

const STEPS: Array<{ key: Screen; label: string }> = [
  { key: "conversation", label: "Conversation" },
  { key: "review",       label: "Review" },
  { key: "done",         label: "Done" },
];

export function OnboardingChatClient({
  sessionId,
  firstMessage,
  mode,
  templateHints = [],
}: {
  sessionId: string;
  firstMessage: OnboardingAIResponse;
  mode: "first" | "improve" | "reprompt";
  /** Human-readable labels of the templates the user picked on the
   *  multi-select picker. Forwarded to continueOnboarding so the AI's
   *  follow-ups + final suggestions are grounded in the merged context. */
  templateHints?: string[];
}) {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const [screen, setScreen] = useState<Screen>("conversation");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: firstMessage.next_message },
  ]);
  const [currentResponse, setCurrentResponse] = useState<OnboardingAIResponse>(firstMessage);
  const [input, setInput] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<OnboardingSuggestions | null>(null);
  const [accepted, setAccepted] = useState<{
    sections: Set<string>;
    entityTypeKeys: Set<string>;
    entityNames: Set<string>;
    trackableCategories: Set<string>;
  }>({ sections: new Set(), entityTypeKeys: new Set(), entityNames: new Set(), trackableCategories: new Set() });
  const [pending, startTransition] = useTransition();
  // If a reply takes longer than 10s, reassure the user instead of leaving
  // them staring at a silent typing indicator. The opening message itself
  // is static and arrives instantly, so this only ever covers a slow AI turn.
  const [slow, setSlow] = useState(false);
  const [prevPending, setPrevPending] = useState(pending);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Clear the "taking longer" note as soon as a turn finishes. Done in
  // render (not an effect) so there's no flash of stale state.
  if (pending !== prevPending) {
    setPrevPending(pending);
    if (!pending) setSlow(false);
  }

  useEffect(() => {
    if (!pending) return;
    const id = window.setTimeout(() => setSlow(true), 10000);
    return () => window.clearTimeout(id);
  }, [pending]);

  async function send(text: string) {
    if (!text.trim() || pending) return;
    const userMsg = text.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setSelectedOptions([]);

    startTransition(async () => {
      const response = await continueOnboarding(sessionId, userMsg, templateHints);
      if (!response) return;
      setMessages((prev) => [...prev, { role: "assistant", content: response.next_message }]);
      setCurrentResponse(response);
      if (response.is_final && response.suggestions) {
        setSuggestions(response.suggestions);
        // Pre-select all suggestions
        setAccepted({
          sections: new Set(response.suggestions.sections.map((s) => s.name)),
          entityTypeKeys: new Set(response.suggestions.entity_types.map((t) => t.key)),
          entityNames: new Set(response.suggestions.entities.map((e) => e.name)),
          trackableCategories: new Set(response.suggestions.trackable_categories),
        });
        setScreen("review");
      }
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
  }

  function handleMultiSelect(opt: string) {
    setSelectedOptions((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt],
    );
  }

  function handleSubmitMultiSelect() {
    if (selectedOptions.length === 0) return;
    send(selectedOptions.join(", "));
  }

  async function handleApply() {
    startTransition(async () => {
      await applyOnboarding(sessionId, {
        sections: Array.from(accepted.sections),
        entityTypeKeys: Array.from(accepted.entityTypeKeys),
        entityNames: Array.from(accepted.entityNames),
        trackableCategories: Array.from(accepted.trackableCategories),
      });
      setScreen("done");
    });
  }

  async function handleSkip() {
    startTransition(async () => {
      await skipOnboarding(sessionId);
      router.push("/dashboard");
    });
  }

  // ── Done screen ──────────────────────────────────────────────────────────
  if (screen === "done") {
    return (
      <main className="flex min-h-screen flex-col bg-canvas">
        <ProgressHeader current="done" onSkip={handleSkip} mode={mode} pending={pending} />
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center animate-fade-up">
          <div className="text-[40px] mb-4">✅</div>
          <h1 className="text-[24px] font-semibold text-ink">You&apos;re all set</h1>
          <p className="mt-2 text-[14px] text-ink-muted">Your workspace is ready.</p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="btn-lift mt-6 inline-flex h-11 items-center rounded-xl bg-brand px-6 text-[13.5px] font-medium text-surface shadow-sm"
          >
            Go to dashboard
          </button>
        </div>
      </main>
    );
  }

  // ── Review screen ────────────────────────────────────────────────────────
  if (screen === "review" && suggestions) {
    const toggle = (set: Set<string>, val: string): Set<string> => {
      const next = new Set(set);
      if (next.has(val)) next.delete(val); else next.add(val);
      return next;
    };

    return (
      <main className="flex min-h-screen flex-col bg-canvas">
        <ProgressHeader current="review" onSkip={handleSkip} mode={mode} pending={pending} />
        <div className="mx-auto w-full max-w-lg px-4 py-8 animate-fade-up">
          <h1 className="mb-1 text-[22px] font-semibold text-ink">Here&apos;s what I suggest</h1>
          <p className="mb-6 text-[13px] text-ink-muted">Uncheck anything you don&apos;t want. You can always add more later.</p>

          {suggestions.sections.length > 0 && (
            <ReviewGroup label="Sections">
              {suggestions.sections.map((s) => (
                <CheckRow key={s.name} checked={accepted.sections.has(s.name)}
                  onChange={() => setAccepted((a) => ({ ...a, sections: toggle(a.sections, s.name) }))}
                  label={s.name} sublabel={s.description} />
              ))}
            </ReviewGroup>
          )}

          {suggestions.entity_types.length > 0 && (
            <ReviewGroup label="Things to track">
              {suggestions.entity_types.map((t) => (
                <CheckRow key={t.key} checked={accepted.entityTypeKeys.has(t.key)}
                  onChange={() => setAccepted((a) => ({ ...a, entityTypeKeys: toggle(a.entityTypeKeys, t.key) }))}
                  label={t.label_plural} sublabel={t.suggested_fields.map((f) => f.label).join(", ")} />
              ))}
            </ReviewGroup>
          )}

          {suggestions.entities.length > 0 && (
            <ReviewGroup label="Sample records">
              {suggestions.entities.map((e) => (
                <CheckRow key={e.name} checked={accepted.entityNames.has(e.name)}
                  onChange={() => setAccepted((a) => ({ ...a, entityNames: toggle(a.entityNames, e.name) }))}
                  label={e.name} sublabel={e.entity_type_key} />
              ))}
            </ReviewGroup>
          )}

          {suggestions.trackable_categories.length > 0 && (
            <ReviewGroup label="Track renewals for">
              {suggestions.trackable_categories.map((c) => (
                <CheckRow key={c} checked={accepted.trackableCategories.has(c)}
                  onChange={() => setAccepted((a) => ({ ...a, trackableCategories: toggle(a.trackableCategories, c) }))}
                  label={c.charAt(0).toUpperCase() + c.slice(1)} />
              ))}
            </ReviewGroup>
          )}

          <div className="mt-8 flex items-center gap-3">
            <button
              type="button"
              onClick={handleApply}
              disabled={pending}
              className="btn-lift inline-flex h-11 items-center rounded-xl bg-brand px-5 text-[13.5px] font-medium text-surface shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Applying…" : "Apply selected"}
            </button>
            <button type="button" onClick={handleSkip} disabled={pending}
              className="text-[13px] text-ink-muted hover:text-ink transition-base">
              Skip
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── Conversation screen ──────────────────────────────────────────────────
  return (
    <main className="flex min-h-screen flex-col bg-canvas">
      <ProgressHeader
        current="conversation"
        onSkip={handleSkip}
        mode={mode}
        pending={pending}
      />

      {/* Templates-picked banner. Tells the user we know what they chose
          and the AI is building on it, not asking them to start over. */}
      {templateHints.length > 0 && (
        <div className="border-b border-line bg-brand-soft px-4 py-2 text-center text-[12px] text-ink">
          Starting from {templateHints.join(" + ")}.
          <span className="ml-1 text-ink-muted">
            I&apos;ll build on this. Feel free to add more.
          </span>
        </div>
      )}

      {/* Chat thread */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex animate-fade-up ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[14px] ${
                m.role === "user"
                  ? "bg-brand-soft text-ink rounded-br-sm"
                  : "bg-surface-raised border border-line text-ink rounded-bl-sm"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {/* Multi-select options. F2 chip styling, brand-tinted on selected. */}
        {!pending && currentResponse.input_type === "multi_select" && currentResponse.options && (
          <div className="space-y-2 pt-2">
            <div className="flex flex-wrap gap-2">
              {currentResponse.options.map((opt) => {
                const on = selectedOptions.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => handleMultiSelect(opt)}
                    className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                      on
                        ? "border-brand bg-brand text-surface shadow-sm"
                        : "border-line bg-canvas text-ink-muted hover:border-line-strong hover:text-ink"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {selectedOptions.length > 0 && (
              <button
                type="button"
                onClick={handleSubmitMultiSelect}
                className="btn-lift mt-2 inline-flex h-9 items-center rounded-xl bg-brand px-4 text-[12.5px] font-medium text-surface shadow-sm"
              >
                Continue
              </button>
            )}
          </div>
        )}

        {pending && (
          <div className="flex flex-col items-start gap-1.5">
            <div className="bg-surface-raised border border-line rounded-2xl rounded-bl-sm px-4 py-3">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-ink-faint animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-ink-faint animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-ink-faint animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
            {slow && (
              <p className="px-1 text-[12px] text-ink-faint">
                Oria is taking a little longer than usual. Hang tight.
              </p>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar. mic is the primary action: large, breathing when
          idle. Send arrow stays as a quiet secondary path. */}
      {currentResponse.input_type !== "multi_select" && (
        <div className="border-t border-line bg-canvas px-4 py-4">
          <div className="flex items-end gap-3 rounded-2xl border border-line bg-surface-raised p-3 focus-within:border-line-strong focus-within:shadow-md transition-base">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder="Tap the mic, or type a message…"
              disabled={pending}
              className="block min-h-[48px] flex-1 resize-none bg-transparent px-2 py-2 text-[14.5px] text-ink placeholder:text-ink-faint outline-none"
            />
            <MicButton
              onTranscribed={(text) => setInput((v) => (v ? `${v} ${text}` : text))}
              targetLanguage={locale}
              size="lg"
              breatheWhenIdle
            />
            <button
              type="button"
              onClick={() => void send(input)}
              disabled={pending || !input.trim()}
              aria-label="Send message"
              className="btn-lift inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-surface hover:bg-ink-soft disabled:opacity-40"
            >
              →
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/**
 * Sticky onboarding header with three-step progress + Skip. The current
 * step is brand-tinted; previous steps stay marked but muted. Designed to
 * orient users without dominating the chat.
 */
function ProgressHeader({
  current,
  onSkip,
  mode,
  pending,
}: {
  current: Screen;
  onSkip: () => void;
  mode: "first" | "improve" | "reprompt";
  pending: boolean;
}) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);
  const stepNumber = currentIndex + 1;
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-[15px] font-medium text-ink">
          {mode === "improve" ? "Improve my Oria" : "Set up Oria"}
        </h1>
        <button
          type="button"
          onClick={onSkip}
          disabled={pending}
          className="text-[12.5px] text-ink-muted hover:text-ink transition-base disabled:opacity-50"
        >
          Skip for now
        </button>
      </div>
      <div className="flex items-center gap-3 px-4 pb-3" aria-label={`Step ${stepNumber} of ${STEPS.length}`}>
        <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">
          Step {stepNumber} of {STEPS.length}
        </span>
        <ol className="flex flex-1 items-center gap-2">
          {STEPS.map((s, i) => {
            const active = i === currentIndex;
            const done = i < currentIndex;
            return (
              <li key={s.key} className="flex-1">
                <div
                  className={`h-1 rounded-full transition-all ${
                    active
                      ? "bg-brand"
                      : done
                        ? "bg-brand/40"
                        : "bg-line"
                  }`}
                  style={{
                    transitionDuration: "var(--duration-base)",
                    transitionTimingFunction: "var(--ease-out-quart)",
                  }}
                />
              </li>
            );
          })}
        </ol>
      </div>
    </header>
  );
}

function ReviewGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-eyebrow">{label}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function CheckRow({
  label, sublabel, checked, onChange,
}: { label: string; sublabel?: string; checked: boolean; onChange: () => void }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-base ${
        checked
          ? "border-brand/40 bg-brand-soft/60"
          : "border-line bg-canvas hover:bg-surface-raised"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 accent-brand" />
      <div className="min-w-0">
        <p className="text-[13px] text-ink">{label}</p>
        {sublabel && <p className="text-[11.5px] text-ink-faint truncate">{sublabel}</p>}
      </div>
    </label>
  );
}
