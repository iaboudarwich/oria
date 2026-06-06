"use client";

import { useState, useTransition } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import {
  ACCENT_PRESETS,
  accentStyleCss,
  accentTone,
  isHex6,
  validateAccentHex,
} from "@/lib/appearance/accent";
import { setAppearancePrefs } from "@/lib/data/appearance-actions";

/**
 * Per-user appearance: THEME (dark/light/system) + ACCENT (the brand highlight).
 * Theme runs through next-themes (instant, no-flash, localStorage) and is also
 * persisted to user_preferences. Accent is applied OPTIMISTICALLY by rewriting
 * the root `#oria-accent` style element (the same CSS the server injected before
 * paint), then persisted + mirrored to a cookie. Custom hex is contrast-guarded
 * in BOTH themes before it can be applied. The semantic data colors never change.
 */
function applyAccentLive(value: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById("oria-accent");
  if (el) el.textContent = accentStyleCss(value);
}

export function AppearanceControls({ initialAccent }: { initialAccent: string }) {
  const t = useTranslations("appearance");
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [accent, setAccent] = useState(initialAccent);
  const [custom, setCustom] = useState(isHex6(initialAccent) ? initialAccent : "");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const tone = resolvedTheme === "light" ? "light" : "dark";
  const previewTone = accentTone(accent, tone);

  const THEMES: Array<{ value: string; label: string }> = [
    { value: "dark", label: t("variant_dark") },
    { value: "light", label: t("variant_light") },
    { value: "system", label: t("variant_system") },
  ];

  function pickTheme(v: string) {
    setTheme(v);
    startTransition(async () => {
      await setAppearancePrefs({ theme: v });
    });
  }

  function pickAccent(v: string) {
    setError(null);
    setAccent(v);
    applyAccentLive(v);
    startTransition(async () => {
      await setAppearancePrefs({ accent: v });
    });
  }

  function applyCustom() {
    const v = custom.trim();
    const res = validateAccentHex(v);
    if (!res.ok) {
      setError(t(`accent_err_${res.reason}` as "accent_err_format"));
      return;
    }
    pickAccent(v);
  }

  const activeTheme = theme ?? "dark";

  return (
    <section className="space-y-6">
      {/* Theme */}
      <fieldset>
        <legend className="mb-2 text-[12.5px] font-medium text-ink">{t("theme_label")}</legend>
        <div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5">
          {THEMES.map((opt) => {
            const active = activeTheme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => pickTheme(opt.value)}
                aria-pressed={active}
                className={`transition-base min-h-[44px] rounded-md px-3.5 text-[12.5px] ${
                  active ? "bg-ink text-surface" : "text-ink-muted hover:text-ink"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Accent */}
      <fieldset>
        <legend className="mb-1 text-[12.5px] font-medium text-ink">{t("accent_label")}</legend>
        <p className="mb-2.5 text-[11.5px] text-ink-faint">{t("accent_note")}</p>
        <div className="flex flex-wrap items-center gap-2.5">
          {ACCENT_PRESETS.map((p) => {
            const active = accent === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => pickAccent(p.key)}
                aria-label={t(`accent_${p.key}` as "accent_mint")}
                aria-pressed={active}
                title={t(`accent_${p.key}` as "accent_mint")}
                className={`transition-base h-9 w-9 rounded-full border-2 ${
                  active ? "border-ink" : "border-transparent hover:border-line-strong"
                }`}
                style={{ background: p[tone].accent }}
              />
            );
          })}
        </div>

        {/* Custom hex (contrast-guarded) */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="color"
            value={isHex6(custom) ? custom : previewTone.accent}
            onChange={(e) => {
              setCustom(e.target.value);
              setError(null);
            }}
            aria-label={t("accent_custom")}
            className="h-9 w-12 cursor-pointer rounded-md border border-line-strong bg-surface-raised"
          />
          <input
            type="text"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setError(null);
            }}
            placeholder="#4FE3AC"
            maxLength={7}
            aria-label={t("accent_custom")}
            className="h-9 w-28 rounded-md border border-line-strong bg-surface px-2.5 font-mono text-[13px] text-ink outline-none focus:border-ink"
          />
          <button
            type="button"
            onClick={applyCustom}
            className="transition-base h-9 rounded-md border border-line-strong px-3 text-[12.5px] text-ink-muted hover:text-ink"
          >
            {t("accent_custom_apply")}
          </button>
        </div>
        {error ? <p className="mt-2 text-[12px] text-down">{error}</p> : null}

        {/* Live preview */}
        <div className="mt-4 flex items-center gap-3">
          <span
            className="inline-flex h-9 items-center rounded-lg px-3.5 text-[13px] font-semibold"
            style={{ background: previewTone.accent, color: previewTone.ink }}
          >
            {t("accent_preview")}
          </span>
          <span
            aria-hidden
            className="h-9 w-9 rounded-lg"
            style={{ background: `color-mix(in srgb, ${previewTone.accent} 14%, transparent)` }}
          />
        </div>
      </fieldset>
    </section>
  );
}
