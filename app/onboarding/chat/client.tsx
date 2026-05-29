"use client";

import { useState, useRef, useTransition } from "react";
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

export function OnboardingChatClient({
  sessionId,
  firstMessage,
  mode,
}: {
  sessionId: string;
  firstMessage: OnboardingAIResponse;
  mode: "first" | "improve" | "reprompt";
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
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    if (!text.trim() || pending) return;
    const userMsg = text.trim();
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setSelectedOptions([]);

    startTransition(async () => {
      const response = await continueOnboarding(sessionId, userMsg);
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
      <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 text-center">
        <div className="text-[40px] mb-4">✅</div>
        <h1 className="text-[24px] font-semibold text-ink">You&apos;re all set</h1>
        <p className="mt-2 text-[14px] text-ink-muted">Your workspace is ready.</p>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="mt-6 inline-flex h-11 items-center rounded-xl bg-ink px-6 text-[13.5px] text-surface hover:bg-ink-soft transition-base"
        >
          Go to dashboard
        </button>
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
      <main className="min-h-screen bg-canvas px-4 py-10">
        <div className="mx-auto max-w-lg">
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
              className="inline-flex h-11 items-center rounded-xl bg-ink px-5 text-[13.5px] text-surface hover:bg-ink-soft disabled:opacity-50 transition-base"
            >
              {pending ? "Applying..." : "Apply selected"}
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
      {/* Header */}
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h1 className="text-[15px] font-medium text-ink">
          {mode === "improve" ? "Improve my Oria" : "Set up Oria"}
        </h1>
        <button
          type="button"
          onClick={handleSkip}
          className="text-[12.5px] text-ink-muted hover:text-ink transition-base"
        >
          Skip for now
        </button>
      </header>

      {/* Chat thread */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[14px] ${
              m.role === "user"
                ? "bg-ink text-surface rounded-br-sm"
                : "bg-surface-raised border border-line text-ink rounded-bl-sm"
            }`}>
              {m.content}
            </div>
          </div>
        ))}

        {/* Multi-select options */}
        {!pending && currentResponse.input_type === "multi_select" && currentResponse.options && (
          <div className="space-y-2 pt-2">
            <div className="flex flex-wrap gap-2">
              {currentResponse.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleMultiSelect(opt)}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-base ${
                    selectedOptions.includes(opt)
                      ? "border-ink bg-ink text-surface"
                      : "border-line bg-canvas text-ink-muted hover:border-line-strong"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            {selectedOptions.length > 0 && (
              <button
                type="button"
                onClick={handleSubmitMultiSelect}
                className="mt-2 inline-flex h-9 items-center rounded-xl bg-ink px-4 text-[12.5px] text-surface hover:bg-ink-soft"
              >
                Continue
              </button>
            )}
          </div>
        )}

        {pending && (
          <div className="flex justify-start">
            <div className="bg-surface-raised border border-line rounded-2xl rounded-bl-sm px-4 py-3">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-ink-faint animate-bounce [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-ink-faint animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-ink-faint animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      {currentResponse.input_type !== "multi_select" && (
        <div className="border-t border-line bg-canvas px-4 py-3">
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface-raised p-2 focus-within:border-line-strong">
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
              placeholder="Type a message..."
              disabled={pending}
              className="block min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[14.5px] text-ink placeholder:text-ink-faint outline-none"
            />
            <MicButton
              onTranscribed={(text) => setInput((v) => (v ? `${v} ${text}` : text))}
              targetLanguage={locale}
              size="md"
            />
            <button
              type="button"
              onClick={() => void send(input)}
              disabled={pending || !input.trim()}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-surface hover:bg-ink-soft disabled:opacity-40 transition-base"
            >
              →
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function ReviewGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">{label}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function CheckRow({
  label, sublabel, checked, onChange,
}: { label: string; sublabel?: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5 hover:bg-surface-raised transition-base">
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 accent-ink" />
      <div className="min-w-0">
        <p className="text-[13px] text-ink">{label}</p>
        {sublabel && <p className="text-[11.5px] text-ink-faint truncate">{sublabel}</p>}
      </div>
    </label>
  );
}
