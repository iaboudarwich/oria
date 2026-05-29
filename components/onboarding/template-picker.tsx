"use client";

import { useState, useTransition } from "react";
import type { WorkspaceTemplate, TemplateKey } from "@/lib/data/workspace-templates";

type Props = {
  templates: WorkspaceTemplate[];
  customTemplate: WorkspaceTemplate;
  /** Server action. `chooseTemplates(formData)`. passed in from the
   *  page so this client component doesn't import server-only code. */
  onSubmit: (formData: FormData) => Promise<void>;
};

/**
 * Multi-select onboarding template picker.
 *
 * Each card behaves like a checkbox: tap to toggle. The Continue button
 * lights up once one or more templates are selected and shows the count
 * ("Continue with 2 templates"). All visual state. brand-tinted border
 * and background when selected, hover lift, focus ring. flows from the
 * F1 design tokens and F2 polish conventions.
 *
 * "Skip for now" stays available as a calm secondary link and submits
 * an empty selection, which the server action treats as Custom/blank.
 */
export function TemplatePicker({
  templates,
  customTemplate,
  onSubmit,
}: Props) {
  const [selected, setSelected] = useState<Set<TemplateKey>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggle(key: TemplateKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function submit(keys: TemplateKey[]) {
    const formData = new FormData();
    if (keys.length === 0) {
      // Skip / blank → server action treats absence as Custom.
      formData.append("template", customTemplate.key);
    } else {
      for (const k of keys) formData.append("template", k);
    }
    startTransition(() => onSubmit(formData));
  }

  const count = selected.size;

  return (
    <>
      {/* Multi-select grid. role=group + aria-label so screen readers
          announce the relationship between the cards. */}
      <div
        role="group"
        aria-label="Workspace templates"
        className="grid gap-4 sm:grid-cols-2"
      >
        {templates.map((t) => {
          const isOn = selected.has(t.key);
          return (
            <button
              key={t.key}
              type="button"
              role="checkbox"
              aria-checked={isOn}
              aria-label={`${t.label}: ${t.description}`}
              disabled={pending}
              onClick={() => toggle(t.key)}
              className={`group hover-lift relative w-full rounded-2xl p-5 text-left transition-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60 ${
                isOn
                  ? "border-2 border-brand bg-brand-soft shadow-md"
                  : "border border-line bg-surface-raised hover:border-line-strong"
              }`}
            >
              {/* Checkmark badge top-right, only when selected. */}
              {isOn ? (
                <span
                  aria-hidden
                  className="animate-scale-in absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-surface shadow-sm"
                >
                  <CheckmarkIcon />
                </span>
              ) : null}

              <div className="mb-3 flex items-center gap-3">
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-[18px] ${
                    isOn ? "bg-surface/70" : "bg-accent-soft/60"
                  }`}
                >
                  {templateEmoji(t.key)}
                </span>
                <span className="text-[15px] font-medium text-ink">{t.label}</span>
              </div>
              <p className="text-[13px] text-ink-muted">{t.description}</p>
              {t.section_seeds.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {t.section_seeds.map((s) => (
                    <span
                      key={s.name}
                      className={`rounded-md border px-2 py-0.5 text-[11px] ${
                        isOn
                          ? "border-brand/30 bg-surface/70 text-ink"
                          : "border-line bg-canvas text-ink-faint"
                      }`}
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Continue + Skip row. The Continue button is the primary action;
          it's disabled until at least one template is picked. */}
      <div className="mt-7 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => submit(Array.from(selected))}
          disabled={count === 0 || pending}
          className="btn-lift inline-flex h-11 items-center justify-center rounded-xl bg-brand px-6 text-[13.5px] font-medium text-surface shadow-sm disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-ink-faint disabled:shadow-none"
        >
          {pending
            ? "Setting up…"
            : count === 0
              ? "Pick at least one"
              : count === 1
                ? "Continue with 1 template"
                : `Continue with ${count} templates`}
        </button>

        <button
          type="button"
          onClick={() => submit([])}
          disabled={pending}
          className="text-[13px] text-ink-faint transition-base hover:text-ink hover:underline disabled:opacity-50"
        >
          Skip for now, start with a blank workspace
        </button>
      </div>
    </>
  );
}

function CheckmarkIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function templateEmoji(key: TemplateKey): string {
  switch (key) {
    case "personal":      return "🏠";
    case "investor":      return "📈";
    case "business":      return "🏢";
    case "family_office": return "🏛️";
    default:              return "✨";
  }
}
