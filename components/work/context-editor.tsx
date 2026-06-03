"use client";

import { useState, useTransition } from "react";
import { saveWorkspaceContext } from "@/lib/data/workspace-context-actions";
import type { WorkspaceContext } from "@/lib/data/workspace-context";

/**
 * Inline editor for the Workspace's standing AI context. Collapsed by
 * default; expands to a small form. Saving uses the server action so
 * RLS gates org membership at the DB.
 */
export function ContextEditor({
  context,
}: {
  context: WorkspaceContext | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveWorkspaceContext(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  const description = context?.description ?? "";
  const instructions = context?.ai_instructions ?? "";
  const metrics = (context?.preferred_metrics ?? []).join(", ");
  const style = context?.preferred_report_style ?? "";

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-eyebrow">
          AI Context
        </h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="cursor-pointer text-[11.5px] text-ink-muted transition-base hover:text-ink"
        >
          {open ? "Close" : context ? "Edit" : "Set up"}
        </button>
      </div>

      {!open ? (
        <div className="rounded-2xl border border-line bg-surface-raised p-4">
          {description ? (
            <p className="text-[13px] text-ink">{description}</p>
          ) : (
            <p className="text-[12.5px] text-ink-faint">
              No context yet. Tell the Work AI what this Workspace is for so
              it can tune answers and reports.
            </p>
          )}
          {instructions ? (
            <p className="mt-2 text-[12px] text-ink-muted">
              <span className="text-ink-faint">Instructions:</span> {instructions}
            </p>
          ) : null}
          {metrics ? (
            <p className="mt-1 text-[12px] text-ink-muted">
              <span className="text-ink-faint">Metrics:</span> {metrics}
            </p>
          ) : null}
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-2xl border border-line bg-surface-raised p-4"
        >
          <Field
            label="Description"
            hint="What this Workspace manages. The AI uses it as standing context."
          >
            <textarea
              name="description"
              defaultValue={description}
              rows={3}
              maxLength={1000}
              placeholder="e.g. ‘This Workspace manages Office Building A. Focus on tenant leases, parking revenue, insurance, maintenance costs, and vendor invoices.’"
              className="block w-full resize-y rounded-md border border-line bg-canvas/40 px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-faint outline-none focus:bg-canvas"
            />
          </Field>
          <Field
            label="Standing instructions"
            hint="How the AI should answer. Tone, what to flag, what to ignore."
          >
            <textarea
              name="ai_instructions"
              defaultValue={instructions}
              rows={3}
              maxLength={2000}
              placeholder="e.g. ‘Flag any vendor invoice 10% above its 12-month average. Show currency. Prefer monthly comparisons.’"
              className="block w-full resize-y rounded-md border border-line bg-canvas/40 px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-faint outline-none focus:bg-canvas"
            />
          </Field>
          <Field
            label="Preferred metrics"
            hint="Comma-separated. Helps the AI lead with what you care about."
          >
            <input
              type="text"
              name="preferred_metrics"
              defaultValue={metrics}
              placeholder="occupancy, NOI, parking revenue, utilities"
              className="block h-9 w-full rounded-md border border-line bg-canvas/40 px-2.5 text-[13px] text-ink placeholder:text-ink-faint outline-none focus:bg-canvas"
            />
          </Field>
          <Field label="Report style" hint="One word or short phrase.">
            <input
              type="text"
              name="preferred_report_style"
              defaultValue={style}
              maxLength={40}
              placeholder="executive · monthly brief · detailed"
              className="block h-9 w-full max-w-xs rounded-md border border-line bg-canvas/40 px-2.5 text-[13px] text-ink placeholder:text-ink-faint outline-none focus:bg-canvas"
            />
          </Field>

          {error ? <p className="text-[11.5px] text-claret">{error}</p> : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="cursor-pointer text-[12px] text-ink-muted transition-base hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-9 cursor-pointer items-center rounded-md bg-ink px-3 text-[12.5px] text-surface transition-base hover:bg-ink-soft disabled:cursor-default disabled:opacity-50"
            >
              {pending ? "Saving" : "Save"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] text-ink">{label}</span>
      {hint ? (
        <span className="mb-1.5 block text-[11.5px] text-ink-faint">{hint}</span>
      ) : null}
      {children}
    </label>
  );
}
