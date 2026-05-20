"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "@/components/ui/icon";

const QUICK_PROMPTS: Array<{ label: string; prompt: string }> = [
  { label: "Revenue vs costs", prompt: "Analyze revenue vs costs this quarter. Highlight margin and the biggest cost drivers." },
  { label: "Top vendors", prompt: "Show top vendors by total spend. Include each vendor's share of total expenses." },
  { label: "Recurring expenses", prompt: "List recurring expenses with average amount and cadence." },
  { label: "Late payments", prompt: "List late payments — tenant, days late, amount." },
  { label: "Lease expirations", prompt: "Which leases expire in the next 6 months? Tenant, date, monthly rent." },
  { label: "Forecast utilities", prompt: "Forecast next quarter's utilities based on recent months." },
  { label: "Monthly trend", prompt: "Show monthly revenue and expense trend for the last 12 months." },
  { label: "Cost ratios", prompt: "Compute key cost ratios (utilities / revenue, maintenance / revenue) and flag anything moving." },
];

/**
 * Custom analysis composer. Quick-action chips fill the prompt; the user
 * can also type freely. Submit POSTs to /api/work/reports/generate with
 * kind="analysis" so it lands in the analyses list. The page picks the
 * row up via revalidatePath + the ReportPoller and renders it inline.
 */
export function AnalysisPrompt() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pickChip(text: string) {
    setPrompt(text);
    setError(null);
  }

  function submit() {
    const text = prompt.trim();
    if (!text || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/work/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, kind: "analysis" }),
      });
      if (!res.ok) {
        try {
          const data = (await res.json()) as { message?: string };
          setError(data?.message ?? "Couldn't start analysis.");
        } catch {
          setError("Couldn't start analysis.");
        }
        return;
      }
      setPrompt("");
      router.refresh();
    });
  }

  return (
    <section>
      <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
        Custom analysis
      </h2>
      <div className="rounded-2xl border border-line bg-surface-raised p-4 space-y-3">
        <p className="text-[12.5px] text-ink-muted">
          Ask in plain English. Oria pulls the relevant uploads and
          generates a structured analysis with the right visual.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => pickChip(q.prompt)}
                className="rounded-full border border-line bg-canvas px-2.5 py-1 text-[11.5px] text-ink-muted transition-base hover:border-line-strong hover:text-ink"
              >
                {q.label}
              </button>
            ))}
          </div>
          <div className="flex items-stretch gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setError(null);
              }}
              placeholder="e.g. ‘Compare parking revenue vs maintenance costs for Building A this quarter.’"
              className="block h-10 flex-1 rounded-xl border border-line bg-canvas/40 px-3 text-[13px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-line-strong"
            />
            <button
              type="submit"
              disabled={pending || prompt.trim().length === 0}
              className="cta inline-flex h-10 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[12.5px] text-surface transition-base hover:bg-ink-soft disabled:cursor-default disabled:opacity-50"
            >
              {pending ? "Analyzing" : "Run analysis"}
              <ArrowRightIcon size={12} />
            </button>
          </div>
          {error ? (
            <p className="text-[11.5px] text-claret">{error}</p>
          ) : null}
        </form>
      </div>
    </section>
  );
}
