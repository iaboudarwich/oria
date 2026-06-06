"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "@/components/ui/icon";

const QUICK_PROMPTS: Array<{ label: string; prompt: string }> = [
  {
    label: "Revenue vs costs",
    prompt: "Analyze revenue vs costs this quarter. Highlight margin and the biggest cost drivers.",
  },
  {
    label: "Top vendors",
    prompt: "Show top vendors by total spend. Include each vendor's share of total expenses.",
  },
  {
    label: "Recurring expenses",
    prompt: "List recurring expenses with average amount and cadence.",
  },
  { label: "Late payments", prompt: "List late payments. Tenant, days late, amount." },
  {
    label: "Lease expirations",
    prompt: "Which leases expire in the next 6 months? Tenant, date, monthly rent.",
  },
  {
    label: "Forecast utilities",
    prompt: "Forecast next quarter's utilities based on recent months.",
  },
  {
    label: "Monthly trend",
    prompt: "Show monthly revenue and expense trend for the last 12 months.",
  },
  {
    label: "Cost ratios",
    prompt:
      "Compute key cost ratios (utilities / revenue, maintenance / revenue) and flag anything moving.",
  },
];

/**
 * Custom analysis composer. Quick-action chips fill the prompt; the user
 * can also type freely. Submit POSTs to /api/work/reports/generate with
 * kind="analysis" so it lands in the analyses list. The page picks the
 * row up via revalidatePath + the ReportPoller and renders it inline.
 *
 * Personalized chips: when the workspace has recurring questions the
 * current user keeps asking the Work agent, they appear as their own
 * row above the canned QUICK_PROMPTS, so a user who repeatedly asks
 * about parking revenue sees that prompt one click away.
 */
export function AnalysisPrompt({ recentQuestions = [] }: { recentQuestions?: string[] } = {}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  function pickChip(text: string) {
    setPrompt(text);
    setError(null);
    setQueued(false);
  }

  function submit() {
    const text = prompt.trim();
    if (!text || pending) return;
    setError(null);
    setQueued(false);
    startTransition(async () => {
      const res = await fetch("/api/work/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, kind: "analysis" }),
      });
      if (!res.ok) {
        let detail: string | undefined;
        try {
          const data = (await res.json()) as { message?: string };
          if (typeof data?.message === "string") detail = data.message;
        } catch {
          // body wasn't JSON; fall through to status-based copy
        }
        if (res.status === 429) {
          setError(
            detail ?? "Daily analysis limit hit. Try again tomorrow or shorten the question.",
          );
        } else if (res.status === 401 || res.status === 403) {
          setError("Your session expired. Refresh the page and try again.");
        } else if (res.status >= 500) {
          setError("Analysis service is briefly unreachable. Try again in a moment.");
        } else {
          setError(detail ?? "Couldn't start analysis.");
        }
        return;
      }
      setPrompt("");
      setQueued(true);
      // Hide the queued confirmation after a beat so the prompt stays calm.
      window.setTimeout(() => setQueued(false), 4000);
      router.refresh();
    });
  }

  return (
    <section>
      <h2 className="text-eyebrow mb-2 px-1">Custom analysis</h2>
      <div className="space-y-3 rounded-2xl border border-line bg-surface-raised p-4">
        <p className="text-[12.5px] text-ink-muted">
          Ask in plain English. Oria pulls the relevant uploads and generates a structured analysis
          with the right visual.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          {recentQuestions.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-eyebrow">You&apos;ve asked before</p>
              <div className="flex flex-wrap gap-1.5">
                {recentQuestions.map((q) => (
                  <button
                    key={`recent-${q}`}
                    type="button"
                    onClick={() => pickChip(q)}
                    title={q}
                    className="transition-base max-w-[260px] truncate rounded-full border border-ink/30 bg-canvas px-2.5 py-1 text-[11.5px] text-ink hover:border-ink"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => pickChip(q.prompt)}
                className="transition-base rounded-full border border-line bg-canvas px-2.5 py-1 text-[11.5px] text-ink-muted hover:border-line-strong hover:text-ink"
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
              className="transition-base block h-10 flex-1 rounded-xl border border-line bg-canvas/40 px-3 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
            />
            <button
              type="submit"
              disabled={pending || prompt.trim().length === 0}
              className="cta transition-base inline-flex h-10 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-[12.5px] text-surface hover:bg-ink-soft disabled:cursor-default disabled:opacity-50"
            >
              {pending ? "Analyzing" : "Run analysis"}
              <ArrowRightIcon size={12} />
            </button>
          </div>
          {error ? (
            <p className="text-[11.5px] text-claret">{error}</p>
          ) : queued ? (
            <p className="text-[11.5px] text-ink-muted">
              Queued. The new analysis will appear below as soon as Oria finishes reading.
            </p>
          ) : null}
        </form>
      </div>
    </section>
  );
}
