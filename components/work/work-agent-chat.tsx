"use client";

import { useCallback, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { ArrowRightIcon } from "@/components/ui/icon";
import { MicButton } from "@/components/ui/mic-button";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import type { Locale } from "@/i18n/config";
import type { SourceItem } from "@/components/ask/source-card";
import { SourceCard } from "@/components/ask/source-card";

type Turn = {
  id: string;
  question: string;
  answer: string;
  sources: SourceItem[];
  state: "streaming" | "done" | "error";
  errorCode?: string;
  errorMessage?: string;
};

/** Prior-turn shape sent back as history. Defined locally. the
 *  server-side AgentMessage type can't be imported into a Client Component. */
type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Persistent Work AI chat. Same NDJSON stream as Ask Oria, different
 * endpoint (/api/work/agent), longer answers, no scope picker. the
 * Workspace IS the scope. Conversation lives in client state for this
 * page; the model's standing context comes from workspace_context on
 * the server.
 */
export function WorkAgentChat({ suggestions }: { suggestions: string[] }) {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const locale = useLocale() as Locale;

  const updateTurn = useCallback((id: string, fn: (t: Turn) => Turn) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }, []);

  // Stream /api/work/agent into turn `id`. Shared by send + retry.
  const runStream = useCallback(
    async (id: string, query: string, history: ChatMessage[]) => {
      setBusy(true);
      // A stream that closes without a done/error frame would leave the
      // turn stuck on "Thinking…"; track it and force an error so Retry
      // shows instead of hanging.
      let settled = false;
      try {
        const res = await fetch("/api/work/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, history }),
        });
        if (!res.ok || !res.body) {
          let friendly: string | undefined;
          try {
            const data = (await res.clone().json()) as { message?: string };
            if (typeof data?.message === "string") friendly = data.message;
          } catch {
            // not JSON
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
                | { type: "done" }
                | { type: "error"; code: string };
              if (evt.type === "sources") {
                updateTurn(id, (t) => ({ ...t, sources: evt.sources }));
              } else if (evt.type === "delta") {
                updateTurn(id, (t) => ({ ...t, answer: t.answer + evt.text }));
              } else if (evt.type === "done") {
                settled = true;
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
        if (!settled) {
          updateTurn(id, (t) =>
            t.state === "streaming" ? { ...t, state: "error", errorCode: "stream_incomplete" } : t,
          );
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "stream_failed";
        updateTurn(id, (t) => ({ ...t, state: "error", errorCode: message }));
      } finally {
        setBusy(false);
        requestAnimationFrame(() => {
          const el = scrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    },
    [updateTurn],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;

      const history: ChatMessage[] = turns
        .filter((t) => t.state === "done")
        .flatMap((t) => [
          { role: "user" as const, content: t.question },
          { role: "assistant" as const, content: t.answer },
        ]);

      const id = crypto.randomUUID();
      setTurns((prev) => [
        ...prev,
        { id, question: text, answer: "", sources: [], state: "streaming" },
      ]);
      setInput("");
      await runStream(id, text, history);
    },
    [busy, turns, runStream],
  );

  // Re-run a failed turn in place, with the history that preceded it.
  const retry = useCallback(
    async (turnId: string) => {
      if (busy) return;
      const idx = turns.findIndex((t) => t.id === turnId);
      if (idx === -1) return;
      const target = turns[idx];
      const history: ChatMessage[] = turns
        .slice(0, idx)
        .filter((t) => t.state === "done")
        .flatMap((t) => [
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

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void send(input);
    }
  }

  const empty = turns.length === 0;

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-1"
        style={{ scrollBehavior: "smooth" }}
      >
        {empty ? (
          <div className="space-y-3">
            <p className="text-[12.5px] text-ink-faint">
              Ask anything operational. Try one of these.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => void send(s)}
                    className="transition-base cursor-pointer rounded-full border border-line bg-canvas px-2.5 py-1 text-[12px] text-ink-muted hover:border-line-strong hover:text-ink"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="space-y-6">
            {turns.map((t) => (
              <li key={t.id} className="space-y-3">
                <p className="text-[13px] text-ink-muted">{t.question}</p>
                {t.sources.length > 0 ? (
                  <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {t.sources.map((s) => (
                      <li key={s.id}>
                        <SourceCard source={s} />
                      </li>
                    ))}
                  </ul>
                ) : null}
                {/* aria-live announces the streamed answer to screen readers. */}
                <div role="status" aria-live="polite" aria-busy={t.state === "streaming"}>
                  {t.state === "error" ? (
                    <WorkErrorMessage turn={t} onRetry={() => retry(t.id)} busy={busy} />
                  ) : t.answer ? (
                    <p className="text-[13.5px] leading-[1.55] whitespace-pre-wrap text-ink">
                      {t.answer}
                    </p>
                  ) : (
                    <p className="text-[13px] text-ink-faint">Thinking…</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="mt-3 flex items-end gap-2 border-t border-line pt-3"
      >
        <AutoGrowTextarea
          value={input}
          onChange={setInput}
          onKeyDown={onKeyDown}
          minRows={2}
          maxRows={8}
          placeholder="Ask the Work AI. Cmd/Ctrl + Enter to send."
          className="transition-base block min-h-[44px] flex-1 rounded-xl border border-line bg-surface-raised px-3 py-2 text-[13.5px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
        />
        <MicButton
          size="sm"
          onTranscribed={(text) => setInput(input ? `${input} ${text}` : text)}
          targetLanguage={locale}
        />
        <button
          type="submit"
          disabled={busy || input.trim().length === 0}
          className="transition-base inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[12.5px] text-surface hover:bg-ink-soft disabled:cursor-default disabled:opacity-50"
        >
          {busy ? "Thinking" : "Ask"}
          <ArrowRightIcon size={12} />
        </button>
      </form>
    </div>
  );
}

/**
 * Calm error copy + a Retry affordance for a failed Work AI turn. `no_key`
 * and an expired session can't be fixed by retrying, so those omit the
 * button; everything else (rate limit, 5xx, dropped stream) offers it.
 */
function WorkErrorMessage({
  turn,
  onRetry,
  busy,
}: {
  turn: Turn;
  onRetry: () => void;
  busy: boolean;
}) {
  const code = turn.errorCode ?? "stream_failed";

  if (code === "no_key") {
    return (
      <p className="text-[13px] text-ink-muted">
        The Work AI isn&apos;t connected to Claude yet. Add an{" "}
        <code className="rounded border border-line bg-canvas px-1 py-0.5 text-[11px]">
          ANTHROPIC_API_KEY
        </code>{" "}
        and reload.
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
    copy = turn.errorMessage ?? "You've asked a lot in a short window. Try again in a minute.";
  } else if (
    code.startsWith("http_5") ||
    code === "stream_failed" ||
    code === "stream_incomplete"
  ) {
    copy = "The Work AI is briefly unreachable. Try again in a moment.";
  } else {
    copy = turn.errorMessage ?? "Something went wrong. Try again in a moment.";
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <p className="text-[13px] text-ink-muted">{copy}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        className="transition-base inline-flex h-6 cursor-pointer items-center rounded-md border border-line bg-canvas px-2 text-[11.5px] text-ink-soft hover:border-line-strong hover:text-ink disabled:cursor-default disabled:opacity-40"
      >
        Retry
      </button>
    </div>
  );
}
