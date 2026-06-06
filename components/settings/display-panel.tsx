"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  DENSITY_VALUES,
  FONT_SIZE_VALUES,
  type Density,
  type FontSize,
} from "@/lib/appearance/prefs";
import { setAppearance } from "@/lib/data/appearance-actions";

/**
 * Per-user display preferences: text size and density (Round 14.8 F1).
 *
 * Applies the choice optimistically to the dashboard shell (the element the
 * server rendered the current value onto) so the page resizes the instant the
 * user picks, then persists durably via setAppearance. The CSS derives
 * --font-scale and the --density-* vars from the data-* attributes, so the
 * control only has to toggle attributes.
 */
function applyToShell(attr: "data-font-size" | "data-density", value: string) {
  if (typeof document === "undefined") return;
  const shell = document.getElementById("oria-shell");
  shell?.setAttribute(attr, value);
}

export function DisplayPanel({
  initialFontSize,
  initialDensity,
}: {
  initialFontSize: FontSize;
  initialDensity: Density;
}) {
  const t = useTranslations("appearance");
  const [fontSize, setFontSize] = useState<FontSize>(initialFontSize);
  const [density, setDensity] = useState<Density>(initialDensity);
  const [, startTransition] = useTransition();

  function persist(next: { fontSize: FontSize; density: Density }) {
    startTransition(async () => {
      await setAppearance({ fontSize: next.fontSize, density: next.density });
    });
  }

  function pickFont(v: FontSize) {
    setFontSize(v);
    applyToShell("data-font-size", v);
    persist({ fontSize: v, density });
  }

  function pickDensity(v: Density) {
    setDensity(v);
    applyToShell("data-density", v);
    persist({ fontSize, density: v });
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{t("display_label")}</h2>
        <p className="mt-1 text-[13px] text-ink-muted">{t("display_hint")}</p>
      </div>

      <fieldset>
        <legend className="mb-2 text-[12.5px] font-medium text-ink">{t("font_size_label")}</legend>
        <div className="inline-flex flex-wrap rounded-lg border border-line-strong bg-surface p-0.5">
          {FONT_SIZE_VALUES.map((v) => {
            const active = fontSize === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => pickFont(v)}
                aria-pressed={active}
                className={`transition-base min-h-[44px] rounded-md px-3.5 text-[12.5px] ${
                  active ? "bg-ink text-surface" : "text-ink-muted hover:text-ink"
                }`}
              >
                {t(`font_${v}`)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[12.5px] font-medium text-ink">{t("density_label")}</legend>
        <div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5">
          {DENSITY_VALUES.map((v) => {
            const active = density === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => pickDensity(v)}
                aria-pressed={active}
                className={`transition-base min-h-[44px] rounded-md px-3.5 text-[12.5px] ${
                  active ? "bg-ink text-surface" : "text-ink-muted hover:text-ink"
                }`}
              >
                {t(`density_${v}`)}
              </button>
            );
          })}
        </div>
      </fieldset>
    </section>
  );
}
