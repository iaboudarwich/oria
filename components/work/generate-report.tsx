"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "@/components/ui/icon";

const KINDS = [
  { value: "summary", label: "Summary" },
  { value: "finance", label: "Finance" },
  { value: "leases", label: "Leases" },
  { value: "forecast", label: "Forecast" },
  { value: "custom", label: "Custom" },
];

/**
 * Brief + kind picker that POSTs to /api/work/reports/generate. The
 * report row is created server-side immediately and generation runs in
 * an after() block; the router.refresh below pulls the new pending row
 * into the reports list, where it flips to "ready" once Claude finishes.
 */
export function GenerateReportForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState("summary");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const text = prompt.trim();
    if (!text || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/work/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, kind }),
      });
      if (!res.ok) {
        try {
          const data = (await res.json()) as { message?: string };
          setError(data?.message ?? "Couldn't start report.");
        } catch {
          setError("Couldn't start report.");
        }
        return;
      }
      setPrompt("");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-2"
    >
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => setKind(k.value)}
            className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-[11.5px] transition-base ${
              kind === k.value
                ? "border-ink bg-ink text-surface"
                : "border-line bg-canvas text-ink-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            setError(null);
          }}
          placeholder="e.g. ‘March operations for Building A’ or ‘Top 10 vendors this quarter’"
          className="block h-10 flex-1 rounded-xl border border-line bg-surface-raised px-3 text-[13px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-line-strong"
        />
        <button
          type="submit"
          disabled={pending || prompt.trim().length === 0}
          className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[12.5px] text-surface transition-base hover:bg-ink-soft disabled:cursor-default disabled:opacity-50"
        >
          {pending ? "Generating" : "Generate"}
          <ArrowRightIcon size={12} />
        </button>
      </div>
      {error ? <p className="text-[11.5px] text-claret">{error}</p> : null}
    </form>
  );
}
