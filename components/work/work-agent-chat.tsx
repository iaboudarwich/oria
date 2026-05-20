"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowRightIcon } from "@/components/ui/icon";
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

/**
 * Persistent Work AI chat. Same NDJSON stream as Ask Oria, different
 * endpoint (/api/work/agent), longer answers, no scope picker — the
 * Workspace IS the scope. Conversation lives in client state for this
 * page; the model's standing context comes from workspace_context on
 * the server.
 */
export function WorkAgentChat({
  suggestions,
}: {
  suggestions: string[];
}) {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const updateTurn = useCallback(
    (id: string, fn: (t: Turn) => Turn) => {
      setTurns((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
    },
    [],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;

      const history = turns
        .filter((t) => t.state === "done")
        .flatMap((t) => [
          { role: "user" as const, content: t.question },
          { role: "assistant" as const, content: t.answer },
        ]);

      const id = crypto.randomUUID();
      const newTurn: Turn = {
        id,
        question: text,
        answer: "",
        sources: [],
        state: "streaming",
      };
      setTurns((prev) => [...prev, newTurn]);
      setInput("");
      setBusy(true);

      try {
        const res = await fetch("/api/work/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: text, history }),
        });
        if (!res.ok || !res.body) {
          let friendly: string | undefined;
          try {
            const data = (await res.clone().json()) as { message?: string };
            if (typeof data?.message === "string") friendly = data.message;
          } catch {
            // not JSON
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
        requestAnimationFrame(() => {
          const el = scrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    },
    [busy, turns, updateTurn],
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
                    className="cursor-pointer rounded-full border border-line bg-canvas px-2.5 py-1 text-[12px] text-ink-muted transition-base hover:border-line-strong hover:text-ink"
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
                {t.state === "error" ? (
                  <p className="text-[13px] text-ink-muted">
                    {t.errorMessage ?? "Something went wrong. Try again in a moment."}
                  </p>
                ) : t.answer ? (
                  <p className="whitespace-pre-wrap text-[13.5px] leading-[1.55] text-ink">
                    {t.answer}
                  </p>
                ) : (
                  <p className="text-[13px] text-ink-faint">Thinking…</p>
                )}
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
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Ask the Work AI. Cmd/Ctrl + Enter to send."
          className="block min-h-[44px] flex-1 resize-y rounded-xl border border-line bg-surface-raised px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-line-strong"
        />
        <button
          type="submit"
          disabled={busy || input.trim().length === 0}
          className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[12.5px] text-surface transition-base hover:bg-ink-soft disabled:cursor-default disabled:opacity-50"
        >
          {busy ? "Thinking" : "Ask"}
          <ArrowRightIcon size={12} />
        </button>
      </form>
    </div>
  );
}
