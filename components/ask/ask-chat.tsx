"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightIcon, SparkIcon } from "@/components/ui/icon";
import { SourceCard, type SourceItem } from "./source-card";

type Turn = {
  id: string;
  question: string;
  answer: string;
  sources: SourceItem[];
  state: "streaming" | "done" | "error";
  errorCode?: string;
  errorMessage?: string;
};

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
   *  when the active org is Personal — this prop is the visual gate, the
   *  data layer is the security gate. */
  crossSpaceAvailable?: boolean;
};

/**
 * Calm ChatGPT-style chat for Ask Oria. Single-page, no server-side history
 * persistence yet — turns live in client state. Streaming uses an NDJSON
 * protocol from /api/ask: each line is one event.
 */
export function AskChat({
  scope,
  suggestions,
  crossSpaceAvailable = false,
}: AskChatProps = {}) {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [crossSpace, setCrossSpace] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const effectiveSuggestions = suggestions ?? SUGGESTIONS;

  const updateTurn = useCallback((id: string, fn: (t: Turn) => Turn) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }, []);

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || busy) return;

      const id = crypto.randomUUID();
      const history = turns.flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer },
      ]);
      const newTurn: Turn = {
        id,
        question: trimmed,
        answer: "",
        sources: [],
        state: "streaming",
      };
      setTurns((prev) => [...prev, newTurn]);
      setInput("");
      setBusy(true);

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmed,
            history,
            scope: scope ?? null,
            crossSpace: crossSpaceAvailable && crossSpace,
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
                | { type: "done" }
                | { type: "error"; code: string };
              if (evt.type === "sources") {
                updateTurn(id, (t) => ({ ...t, sources: evt.sources }));
              } else if (evt.type === "delta") {
                updateTurn(id, (t) => ({ ...t, answer: t.answer + evt.text }));
              } else if (evt.type === "done") {
                updateTurn(id, (t) => ({ ...t, state: "done" }));
              } else if (evt.type === "error") {
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
      } catch (e) {
        const message = e instanceof Error ? e.message : "stream_failed";
        updateTurn(id, (t) => ({ ...t, state: "error", errorCode: message }));
      } finally {
        setBusy(false);
      }
    },
    [busy, turns, updateTurn, scope, crossSpace, crossSpaceAvailable],
  );

  // Auto-scroll on new turn / streaming text.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns]);

  // Cmd/Ctrl + Enter sends.
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
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
      {crossSpaceAvailable && !scope ? (
        <CrossSpaceToggle
          on={crossSpace}
          onToggle={() => setCrossSpace((v) => !v)}
        />
      ) : null}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-6">
        {turns.length === 0 ? (
          <EmptyState
            scope={scope}
            suggestions={effectiveSuggestions}
            onSuggest={(q) => {
              setInput(q);
              textareaRef.current?.focus();
            }}
          />
        ) : (
          <ul className="space-y-8">
            {turns.map((t) => (
              <li key={t.id}>
                <TurnView turn={t} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <Composer
        ref={textareaRef}
        value={input}
        busy={busy}
        placeholder={scope ? `Ask about ${scope.label}…` : undefined}
        onChange={setInput}
        onKeyDown={onKeyDown}
        onSubmit={() => send(input)}
      />
    </div>
  );
}

/**
 * Personal-owner-only pill: "This space" ↔ "Everywhere I can access".
 * When ON, the server includes every org the user is a member of in
 * retrieval (Personal + Circles + Workspaces). The page only shows the
 * toggle when the user actually has more than one space; the API also
 * re-checks active-org=personal AND role=owner so a forged flag can
 * never broaden a Circle or Workspace search.
 */
function CrossSpaceToggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mb-3 flex items-center gap-2 px-1">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-[11.5px] transition-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
          on
            ? "border-ink bg-ink text-surface"
            : "border-line bg-canvas text-ink-muted hover:border-line-strong hover:text-ink"
        }`}
      >
        {on ? "Everywhere I can access" : "This space"}
      </button>
      <span className="text-[11.5px] text-ink-faint">
        {on
          ? "Searching across Personal, Circles, and Workspaces."
          : "Only the active space."}
      </span>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  return (
    <article className="animate-fade-up">
      <p className="text-[13px] text-ink-faint">You asked</p>
      <p className="mt-1 text-[15px] text-ink">{turn.question}</p>

      <div className="mt-4 rounded-2xl border border-line bg-surface-raised px-4 py-3.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
          <SparkIcon size={11} />
          <span>Oria</span>
        </div>
        {turn.state === "error" ? (
          <ErrorMessage
            code={turn.errorCode ?? "stream_failed"}
            message={turn.errorMessage}
          />
        ) : turn.answer.length === 0 && turn.state === "streaming" ? (
          <Thinking />
        ) : (
          <AnswerText answer={turn.answer} sources={turn.sources} />
        )}
      </div>

      {turn.sources.length > 0 ? (
        <div className="mt-3">
          <p className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
            Sources
          </p>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {turn.sources.map((s) => (
              <li key={s.id}>
                <SourceCard source={s} />
              </li>
            ))}
          </ul>
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
}: {
  code: string;
  message?: string;
}) {
  // Specific, calm copy per known cause. Server-side codes ("no_key",
  // "rate_limited") match what the API route emits. HTTP-prefixed codes
  // come from the !res.ok branch.
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
  if (code === "rate_limited" || code === "http_429") {
    return (
      <p className="text-[13px] text-ink-muted">
        {message ?? "You've asked a lot in a short window. Try again in a minute."}
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
  if (code.startsWith("http_5") || code === "stream_failed") {
    return (
      <p className="text-[13px] text-ink-muted">
        Ask Oria is briefly unreachable. Try again in a moment.
      </p>
    );
  }
  if (message) {
    return <p className="text-[13px] text-ink-muted">{message}</p>;
  }
  return (
    <p className="text-[13px] text-claret">
      Something went wrong. Try again in a moment.
    </p>
  );
}

function EmptyState({
  scope,
  suggestions,
  onSuggest,
}: {
  scope?: AskScope | null;
  suggestions: string[];
  onSuggest: (q: string) => void;
}) {
  const label = scope ? `Ask ${scope.label}` : "Ask Oria";
  const headline = scope
    ? `What do you want to know about ${scope.label}?`
    : "What would you like to remember?";
  const sub = scope
    ? `Scoped to your ${scope.label} section. Answers come from items in this section only.`
    : "Ask anything about what you've uploaded, your reminders, or your calendar. Answers come straight from your own files, with sources.";
  return (
    <div className="mx-auto max-w-xl pt-6 text-center animate-fade-up">
      <p className="text-[11.5px] uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </p>
      <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">
        {headline}
      </h1>
      <p className="mt-2 text-[13.5px] text-ink-muted">{sub}</p>

      <ul className="mt-7 flex flex-wrap justify-center gap-1.5">
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
};

const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(
  function Composer({ value, busy, placeholder, onChange, onKeyDown, onSubmit }, ref) {
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
