"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightIcon, SparkIcon } from "@/components/ui/icon";
import { SourceCard, type SourceItem } from "./source-card";
import { MicButton } from "@/components/ui/mic-button";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";

type Turn = {
  id: string;
  question: string;
  answer: string;
  sources: SourceItem[];
  state: "streaming" | "done" | "error";
  errorCode?: string;
  errorMessage?: string;
  /** This turn was answered on the reasoning tier (deeper thinking). */
  usedReasoning?: boolean;
  /** The classifier offered deeper thinking for this question. */
  reasoningOffered?: boolean;
  /** Reasoning trace (Anthropic), for the "View reasoning" collapsible. */
  reasoning?: string;
};

export type ReasoningMode = "auto" | "manual" | "always" | "never";

/** Prior-turn shape sent back to /api/ask as conversation history.
 *  Defined locally. the server-side AgentMessage type can't be imported
 *  into a Client Component. */
type ChatMessage = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What flights do I have coming up?",
  "When did I last pay my electricity bill?",
  "Show me the last receipt from the grocery store.",
  "What is due this week?",
];

/**
 * Optional section scope. When set, the chat is restricted to one section:
 * retrieval and the agent both refuse cross-section answers, the empty-state
 * copy adapts, and the chat is visually framed as "Ask {section}".
 */
export type AskScope = {
  kind: "builtin" | "custom" | "smart";
  key: string;
  label: string;
};

type AskChatProps = {
  scope?: AskScope | null;
  /** Custom suggestion chips for the empty state. Defaults to general life
   *  prompts; section pages pass section-specific examples. */
  suggestions?: string[];
  /** When true, render the God's Eye toggle. The server only honours it
   *  when the active org is Personal. this prop is the visual gate, the
   *  data layer is the security gate. */
  crossSpaceAvailable?: boolean;
  /** Top recent unique questions the current user has asked in this
   *  org. Rendered as a separate row above the static suggestions so
   *  Oria offers the questions they actually return to. */
  recentQuestions?: string[];
  /** Name of the active space, shown in the scope control's description. */
  spaceName?: string | null;
  /** The user's reasoning preference (controls the offer + button). */
  reasoningMode?: ReasoningMode;
};

/**
 * Calm ChatGPT-style chat for Ask Oria. Single-page, no server-side history
 * persistence yet. turns live in client state. Streaming uses an NDJSON
 * protocol from /api/ask: each line is one event.
 */
export function AskChat({
  scope,
  suggestions,
  crossSpaceAvailable = false,
  recentQuestions = [],
  spaceName = null,
  reasoningMode = "auto",
}: AskChatProps = {}) {
  const tr = useTranslations("ask");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [crossSpace, setCrossSpace] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const effectiveSuggestions = suggestions ?? SUGGESTIONS;
  // Tracks the server-assigned conversation id once the first turn
  // completes. Sent in all subsequent requests so messages are grouped.
  const conversationIdRef = useRef<string | null>(null);

  const updateTurn = useCallback((id: string, fn: (t: Turn) => Turn) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }, []);

  // Open /api/ask and stream the NDJSON events into the turn `id`. Shared
  // by a fresh send and by Retry, so both follow the exact same protocol.
  const runStream = useCallback(
    async (id: string, query: string, history: ChatMessage[], reasoning = false) => {
      setBusy(true);
      const effectiveReasoning = reasoning || reasoningMode === "always";
      if (effectiveReasoning) updateTurn(id, (t) => ({ ...t, usedReasoning: true }));
      // Track whether we saw a terminal frame. A stream that closes
      // without one (proxy drop, server crash mid-answer) would otherwise
      // leave the turn stuck on "Thinking…" forever. the hang we're
      // guarding against. We force it to an error so Retry appears.
      let settled = false;
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            history,
            scope: scope ?? null,
            crossSpace: crossSpaceAvailable && crossSpace,
            conversationId: conversationIdRef.current ?? null,
            reasoning: effectiveReasoning,
          }),
        });
        if (!res.ok || !res.body) {
          let friendly: string | undefined;
          try {
            const data = (await res.clone().json()) as { message?: string };
            if (typeof data?.message === "string") friendly = data.message;
          } catch {
            // body wasn't JSON, fall through to generic message
          }
          settled = true;
          updateTurn(id, (t) => ({
            ...t,
            state: "error",
            errorCode: `http_${res.status}`,
            errorMessage: friendly,
          }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const evt = JSON.parse(line) as
                | { type: "sources"; sources: SourceItem[] }
                | { type: "delta"; text: string }
                | { type: "reasoning_offer" }
                | { type: "reasoning"; text: string }
                | { type: "done"; conversationId?: string | null }
                | { type: "error"; code: string };
              if (evt.type === "sources") {
                updateTurn(id, (t) => ({ ...t, sources: evt.sources }));
              } else if (evt.type === "reasoning_offer") {
                updateTurn(id, (t) => ({ ...t, reasoningOffered: true }));
              } else if (evt.type === "reasoning") {
                updateTurn(id, (t) => ({ ...t, reasoning: evt.text }));
              } else if (evt.type === "delta") {
                updateTurn(id, (t) => ({ ...t, answer: t.answer + evt.text }));
              } else if (evt.type === "done") {
                settled = true;
                // Capture server-assigned conversation id so follow-up
                // turns are appended to the same conversation.
                if (
                  evt.conversationId &&
                  !conversationIdRef.current
                ) {
                  conversationIdRef.current = evt.conversationId;
                }
                updateTurn(id, (t) => ({ ...t, state: "done" }));
              } else if (evt.type === "error") {
                settled = true;
                updateTurn(id, (t) => ({
                  ...t,
                  state: "error",
                  errorCode: evt.code,
                }));
              }
            } catch {
              // ignore malformed line
            }
          }
        }
        // Stream ended without a done/error frame. don't hang.
        if (!settled) {
          updateTurn(id, (t) =>
            t.state === "streaming"
              ? { ...t, state: "error", errorCode: "stream_incomplete" }
              : t,
          );
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "stream_failed";
        updateTurn(id, (t) => ({ ...t, state: "error", errorCode: message }));
      } finally {
        setBusy(false);
      }
    },
    [updateTurn, scope, crossSpace, crossSpaceAvailable, reasoningMode],
  );

  const send = useCallback(
    async (question: string, reasoning = false) => {
      const trimmed = question.trim();
      if (!trimmed || busy) return;

      const id = crypto.randomUUID();
      const history: ChatMessage[] = turns.flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer },
      ]);
      setTurns((prev) => [
        ...prev,
        { id, question: trimmed, answer: "", sources: [], state: "streaming" },
      ]);
      setInput("");
      await runStream(id, trimmed, history, reasoning);
    },
    [busy, turns, runStream],
  );

  // Re-run a turn with deeper thinking (the offer pill). History is the turns
  // before it, so the reasoning answer sees the same context.
  const reasoningRerun = useCallback(
    async (turnId: string) => {
      if (busy) return;
      const idx = turns.findIndex((t) => t.id === turnId);
      if (idx === -1) return;
      const target = turns[idx];
      const history: ChatMessage[] = turns.slice(0, idx).flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer },
      ]);
      updateTurn(turnId, (t) => ({
        ...t,
        answer: "",
        sources: [],
        reasoning: undefined,
        reasoningOffered: false,
        state: "streaming",
      }));
      await runStream(turnId, target.question, history, true);
    },
    [busy, turns, updateTurn, runStream],
  );

  // Re-run a failed turn in place. History is the turns that preceded it,
  // so the retry sees the same context the original attempt did.
  const retry = useCallback(
    async (turnId: string) => {
      if (busy) return;
      const idx = turns.findIndex((t) => t.id === turnId);
      if (idx === -1) return;
      const target = turns[idx];
      const history: ChatMessage[] = turns.slice(0, idx).flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer },
      ]);
      updateTurn(turnId, (t) => ({
        ...t,
        answer: "",
        sources: [],
        state: "streaming",
        errorCode: undefined,
        errorMessage: undefined,
      }));
      await runStream(turnId, target.question, history);
    },
    [busy, turns, updateTurn, runStream],
  );

  // Auto-scroll on new turn / streaming text.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns]);

  // Cmd/Ctrl + Enter sends.
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Enter") {
      // Cmd/Ctrl+Shift+Enter: submit with deeper thinking.
      e.preventDefault();
      if (reasoningMode !== "never") void send(input, true);
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void send(input);
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  // Section-scoped chats sit inside a page (Diet, Bills, Section detail) so
  // they take a fixed compact height. The general /dashboard/ask page uses
  // the full viewport.
  const containerHeight = scope
    ? "min-h-[360px] max-h-[560px]"
    : "h-[calc(100vh-160px)]";
  return (
    <div className={`flex ${containerHeight} flex-col`}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-6">
        {turns.length === 0 ? (
          <EmptyState
            scope={scope}
            suggestions={effectiveSuggestions}
            recentQuestions={recentQuestions}
            onSuggest={(q) => {
              setInput(q);
              textareaRef.current?.focus();
            }}
          />
        ) : (
          <ul className="space-y-8">
            {turns.map((t) => (
              <li key={t.id}>
                <TurnView
                  turn={t}
                  onRetry={() => retry(t.id)}
                  onReason={() => reasoningRerun(t.id)}
                  busy={busy}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {crossSpaceAvailable && !scope ? (
        <ScopeControl
          everywhere={crossSpace}
          onChange={setCrossSpace}
          spaceName={spaceName}
        />
      ) : null}

      <Composer
        ref={textareaRef}
        value={input}
        busy={busy}
        placeholder={scope ? `Ask about ${scope.label}…` : undefined}
        onChange={setInput}
        onKeyDown={onKeyDown}
        onSubmit={() => send(input)}
        onReason={reasoningMode !== "never" ? () => send(input, true) : undefined}
        reasonLabel={tr("think_harder")}
        reasonTooltip={tr("think_harder_tip")}
      />
    </div>
  );
}

/**
 * Scope segmented control sitting directly above the chat input. Two clear,
 * side-by-side options with descriptions so the choice is unmissable:
 * "This workspace" (active space only) vs "Everything I can access" (every
 * space the user owns). The active option carries the brand accent. Shown
 * Personal-owner-only; the API re-checks active-org=personal AND role=owner,
 * so a forged flag can never broaden a Circle or Workspace search.
 */
function ScopeControl({
  everywhere,
  onChange,
  spaceName,
}: {
  everywhere: boolean;
  onChange: (everywhere: boolean) => void;
  spaceName: string | null;
}) {
  const t = useTranslations("ask.scope");
  return (
    <div
      role="radiogroup"
      aria-label={t("aria")}
      className="mb-2 inline-flex gap-1 rounded-lg border border-line bg-canvas/60 p-0.5"
    >
      <ScopeOption
        active={!everywhere}
        onClick={() => onChange(false)}
        title={t("this_label")}
        info={t("this_desc", { name: spaceName ?? t("this_fallback") })}
      />
      <ScopeOption
        active={everywhere}
        onClick={() => onChange(true)}
        title={t("all_label")}
        info={t("all_desc")}
      />
    </div>
  );
}

/**
 * Compact segmented scope control. Single line, light borders, the full
 * description moved to a tooltip so it does not dominate the page.
 */
function ScopeOption({
  active,
  onClick,
  title,
  info,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  info: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      title={info}
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-[13px] transition-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        active
          ? "bg-brand/12 font-medium text-ink"
          : "text-ink-muted hover:text-ink"
      }`}
    >
      {title}
    </button>
  );
}

// Words that signal the user wants to see where an answer came from.
// When the question contains one of these, sources auto-expand;
// otherwise they're tucked behind a small "Show sources" link.
const SOURCE_INTENT = /\b(source|sources|file|files|where|which file|origin|proof|show me|attach|attachment|receipt|invoice|document|doc|pdf)\b/i;

function TurnView({
  turn,
  onRetry,
  onReason,
  busy,
}: {
  turn: Turn;
  onRetry: () => void;
  onReason: () => void;
  busy: boolean;
}) {
  const t = useTranslations("ask");
  const wantsSources = SOURCE_INTENT.test(turn.question);
  const [sourcesOpen, setSourcesOpen] = useState(wantsSources);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  return (
    <article className="animate-fade-up">
      <p className="text-[13px] text-ink-faint">You asked</p>
      <p className="mt-1 text-[15px] text-ink">{turn.question}</p>

      {/* aria-live lets screen readers announce the answer as it streams
          in; aria-busy flags that more text is still arriving. */}
      <div
        className="mt-4 rounded-2xl border border-line bg-surface-raised px-4 py-3.5"
        role="status"
        aria-live="polite"
        aria-busy={turn.state === "streaming"}
      >
        <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
          <SparkIcon size={11} />
          <span>{turn.usedReasoning ? t("oria_reasoning") : "Oria"}</span>
        </div>
        {turn.state === "error" ? (
          <ErrorMessage
            code={turn.errorCode ?? "stream_failed"}
            message={turn.errorMessage}
            onRetry={onRetry}
            busy={busy}
          />
        ) : turn.answer.length === 0 && turn.state === "streaming" ? (
          turn.usedReasoning ? (
            <p className="text-[14px] text-ink-soft">{t("thinking_deeper")}</p>
          ) : (
            <Thinking />
          )
        ) : (
          <AnswerText answer={turn.answer} sources={turn.sources} />
        )}
      </div>

      {/* Offer pill: classifier flagged this as analytical and it was answered
          on the fast tier. Let the user re-run with deeper thinking. */}
      {turn.reasoningOffered && !turn.usedReasoning && turn.state === "done" ? (
        <button
          type="button"
          onClick={onReason}
          disabled={busy}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft/20 px-3 py-1 text-[12px] text-ink transition-base hover:bg-accent-soft/40 disabled:opacity-50"
        >
          <SparkIcon size={11} />
          {t("reasoning_offer")}
        </button>
      ) : null}

      {/* View reasoning (Anthropic extended thinking), default collapsed. */}
      {turn.reasoning && turn.state === "done" ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setReasoningOpen((o) => !o)}
            className="text-[11.5px] text-ink-faint transition-base hover:text-ink"
          >
            {reasoningOpen ? t("hide_reasoning") : t("view_reasoning")}
          </button>
          {reasoningOpen ? (
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-canvas px-3 py-2 text-[12px] leading-relaxed text-ink-muted">
              {turn.reasoning}
            </pre>
          ) : null}
        </div>
      ) : null}

      {turn.sources.length > 0 && turn.state !== "streaming" ? (
        <div className="mt-3">
          {sourcesOpen ? (
            <>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <p className="text-eyebrow">
                  Sources
                </p>
                <button
                  type="button"
                  onClick={() => setSourcesOpen(false)}
                  className="cursor-pointer text-[11px] text-ink-faint hover:text-ink transition-base"
                >
                  Hide
                </button>
              </div>
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {turn.sources.map((s) => (
                  <li key={s.id}>
                    <SourceCard source={s} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSourcesOpen(true)}
              className="cursor-pointer text-[11.5px] text-ink-faint hover:text-ink transition-base"
            >
              Show sources ({turn.sources.length})
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
}

/**
 * Render the answer text with [N] citations rendered as small clickable chips
 * that scroll to the matching source card (and visually anchor the claim).
 */
function AnswerText({
  answer,
  sources,
}: {
  answer: string;
  sources: SourceItem[];
}) {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  // Split on [N] tokens, preserving the tokens as separate parts.
  const parts = answer.split(/(\[\d+\])/g);
  return (
    <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (!match) return <span key={i}>{part}</span>;
        const n = Number(match[1]);
        const src = sourceById.get(n);
        if (!src) return <span key={i}>{part}</span>;
        return (
          <a
            key={i}
            href={src.href}
            className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-md bg-canvas px-1.5 text-[10.5px] font-medium text-ink-soft transition-base hover:bg-ink hover:text-surface"
            aria-label={`Open source ${n}: ${src.title}`}
          >
            {n}
          </a>
        );
      })}
    </p>
  );
}

function Thinking() {
  return (
    <p className="flex items-center gap-2 text-[13px] text-ink-faint">
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      Thinking…
    </p>
  );
}

function ErrorMessage({
  code,
  message,
  onRetry,
  busy,
}: {
  code: string;
  message?: string;
  onRetry: () => void;
  busy: boolean;
}) {
  // Specific, calm copy per known cause. Server-side codes ("no_key",
  // "rate_limited") match what the API route emits. HTTP-prefixed codes
  // come from the !res.ok branch; "stream_incomplete" is the client's
  // own guard for a stream that closed without a done/error frame.
  //
  // `no_key` and an expired session aren't fixed by retrying, so those
  // skip the Retry button. Everything else offers it.
  if (code === "no_key") {
    return (
      <p className="text-[13px] text-ink-muted">
        Ask Oria isn&apos;t connected to Claude yet. Add{" "}
        <code className="rounded border border-line bg-canvas px-1 py-0.5 text-[11px]">
          ANTHROPIC_API_KEY
        </code>{" "}
        to your environment and reload.
      </p>
    );
  }
  if (code === "http_401" || code === "http_403") {
    return (
      <p className="text-[13px] text-ink-muted">
        Your session expired. Refresh the page and try again.
      </p>
    );
  }

  let copy: string;
  if (code === "rate_limited" || code === "http_429") {
    copy =
      message ?? "You've asked a lot in a short window. Try again in a minute.";
  } else if (
    code.startsWith("http_5") ||
    code === "stream_failed" ||
    code === "stream_incomplete"
  ) {
    copy = "Ask Oria is briefly unreachable. Try again in a moment.";
  } else {
    copy = message ?? "Something went wrong. Try again in a moment.";
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <p className="text-[13px] text-ink-muted">{copy}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        className="inline-flex h-6 cursor-pointer items-center rounded-md border border-line bg-canvas px-2 text-[11.5px] text-ink-soft transition-base hover:border-line-strong hover:text-ink disabled:cursor-default disabled:opacity-40"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState({
  scope,
  suggestions,
  recentQuestions,
  onSuggest,
}: {
  scope?: AskScope | null;
  suggestions: string[];
  recentQuestions: string[];
  onSuggest: (q: string) => void;
}) {
  const headline = scope
    ? `What do you want to know about ${scope.label}?`
    : "What would you like to remember?";
  const sub = scope
    ? `Scoped to ${scope.label}. Answers come from this section only.`
    : "Ask about anything you've uploaded, your reminders, or your calendar.";
  return (
    <div className="mx-auto max-w-xl pt-6 text-center animate-fade-up">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink sm:text-[24px]">
        {headline}
      </h1>
      <p className="mt-2 text-[13.5px] text-ink-muted">{sub}</p>

      {recentQuestions.length > 0 ? (
        <div className="mt-6 space-y-1.5">
          <p className="text-eyebrow">
            You&apos;ve asked before
          </p>
          <ul className="flex flex-wrap justify-center gap-1.5">
            {recentQuestions.map((s) => (
              <li key={`recent-${s}`}>
                <button
                  type="button"
                  onClick={() => onSuggest(s)}
                  className="inline-flex h-8 items-center rounded-full border border-ink/30 bg-canvas px-3 text-[12px] text-ink transition-base hover:border-ink"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="mt-5 flex flex-wrap justify-center gap-1.5">
        {suggestions.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onSuggest(s)}
              className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-[12px] text-ink-soft transition-base hover:border-line-strong hover:text-ink"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ComposerProps = {
  value: string;
  busy: boolean;
  placeholder?: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  /** Submit with deeper thinking (omitted when reasoning_mode is never). */
  onReason?: () => void;
  reasonLabel?: string;
  reasonTooltip?: string;
};

const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(
  function Composer(
    { value, busy, placeholder, onChange, onKeyDown, onSubmit, onReason, reasonLabel, reasonTooltip },
    ref,
  ) {
    const locale = useLocale() as Locale;
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="sticky bottom-0 pt-3"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface-raised p-2 shadow-[0_1px_2px_rgba(28,26,23,0.04),0_2px_8px_-6px_rgba(28,26,23,0.10)] focus-within:border-line-strong focus-within:shadow-[0_2px_4px_rgba(28,26,23,0.05),0_8px_24px_-14px_rgba(28,26,23,0.30)]">
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            autoFocus
            placeholder={placeholder ?? "Ask Oria anything…"}
            className="block min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[14.5px] text-ink placeholder:text-ink-faint outline-none"
          />
          <MicButton
            onTranscribed={(text) => onChange(value ? `${value} ${text}` : text)}
            targetLanguage={locale}
            size="sm"
            className="mb-0.5"
          />
          {onReason ? (
            <button
              type="button"
              onClick={onReason}
              disabled={busy || value.trim().length === 0}
              title={reasonTooltip}
              aria-label={reasonLabel}
              className="mb-0.5 inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-line px-2.5 text-[12px] text-ink-soft transition-base hover:border-line-strong hover:text-ink disabled:opacity-40"
            >
              <SparkIcon size={12} />
              <span className="hidden sm:inline">{reasonLabel}</span>
            </button>
          ) : null}
          <button
            type="submit"
            disabled={busy || value.trim().length === 0}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-surface transition-base hover:bg-ink-soft disabled:opacity-40"
            aria-label="Send question"
          >
            <ArrowRightIcon size={14} />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-ink-faint">
          Enter to send, Shift + Enter for newline.
        </p>
      </form>
    );
  },
);
