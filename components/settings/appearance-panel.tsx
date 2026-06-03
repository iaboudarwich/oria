"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PRESET_ACCENTS } from "@/lib/data/space-theme";
import { setSpaceTheme, setSpaceThemeVariant } from "@/lib/data/theme-actions";

type ThemeVariant = "light" | "dark" | "system" | null;
const VARIANT_OPTIONS: Array<{ value: ThemeVariant; key: string }> = [
  { value: null, key: "variant_inherit" },
  { value: "light", key: "variant_light" },
  { value: "dark", key: "variant_dark" },
  { value: "system", key: "variant_system" },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Per-space appearance controls: accent color (brand) and shadow color.
 * Eight presets plus a custom hex input each. Saving updates the org and the
 * dashboard re-themes via the CSS-var cascade on the next layout render.
 */
export function AppearancePanel({
  initialAccent,
  initialShadow,
  defaultAccent,
  initialVariant,
}: {
  initialAccent: string | null;
  initialShadow: string | null;
  defaultAccent: string;
  initialVariant: ThemeVariant;
}) {
  const ta = useTranslations("appearance");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [accent, setAccent] = useState(initialAccent ?? defaultAccent);
  const [shadow, setShadow] = useState(initialShadow ?? "");
  const [variant, setVariant] = useState<ThemeVariant>(initialVariant);
  const [saved, setSaved] = useState(false);

  function selectVariant(v: ThemeVariant) {
    setVariant(v);
    startTransition(async () => {
      await setSpaceThemeVariant(v);
      router.refresh();
    });
  }

  function save() {
    if (pending) return;
    const fd = new FormData();
    if (HEX.test(accent)) fd.set("accent_color", accent);
    if (HEX.test(shadow)) fd.set("shadow_color", shadow);
    startTransition(async () => {
      await setSpaceTheme(fd);
      setSaved(true);
      router.refresh();
      window.setTimeout(() => setSaved(false), 2000);
    });
  }

  function reset() {
    setAccent(defaultAccent);
    setShadow("");
    const fd = new FormData(); // empty clears both -> template default
    startTransition(async () => {
      await setSpaceTheme(fd);
      router.refresh();
    });
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Appearance</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Give this space its own identity. The accent drives buttons,
          indicators, and focus rings; the shadow tints the depth on cards and
          modals. Changes apply to this space only.
        </p>
      </div>

      <div>
        <p className="mb-2 text-[12.5px] font-medium text-ink">Accent color</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_ACCENTS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setAccent(p.hex)}
              aria-label={p.label}
              title={p.label}
              className={`h-8 w-8 rounded-full border-2 transition-base ${
                accent.toLowerCase() === p.hex.toLowerCase()
                  ? "border-ink"
                  : "border-transparent hover:border-line-strong"
              }`}
              style={{ backgroundColor: p.hex }}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="color"
            value={HEX.test(accent) ? accent : defaultAccent}
            onChange={(e) => setAccent(e.target.value)}
            aria-label="Custom accent color"
            className="h-9 w-12 cursor-pointer rounded-md border border-line-strong bg-surface-raised"
          />
          <input
            type="text"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            placeholder="#5B7CDD"
            maxLength={7}
            className="h-9 w-28 rounded-md border border-line-strong bg-surface px-2.5 font-mono text-[13px] text-ink outline-none focus:border-ink"
          />
        </div>
      </div>

      <div>
        <p className="mb-1 text-[12.5px] font-medium text-ink">{ta("theme_label")}</p>
        <p className="mb-2 text-[11.5px] text-ink-faint">{ta("theme_hint")}</p>
        <div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5">
          {VARIANT_OPTIONS.map((opt) => {
            const active = variant === opt.value;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => selectVariant(opt.value)}
                disabled={pending}
                className={`rounded-md px-3 py-1.5 text-[12.5px] transition-base disabled:opacity-60 ${
                  active ? "bg-ink text-surface" : "text-ink-muted hover:text-ink"
                }`}
              >
                {ta(opt.key)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[12.5px] font-medium text-ink">
          Shadow color{" "}
          <span className="font-normal text-ink-faint">(optional)</span>
        </p>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={HEX.test(shadow) ? shadow : HEX.test(accent) ? accent : defaultAccent}
            onChange={(e) => setShadow(e.target.value)}
            aria-label="Custom shadow color"
            className="h-9 w-12 cursor-pointer rounded-md border border-line-strong bg-surface-raised"
          />
          <input
            type="text"
            value={shadow}
            onChange={(e) => setShadow(e.target.value)}
            placeholder="Defaults to accent"
            maxLength={7}
            className="h-9 w-40 rounded-md border border-line-strong bg-surface px-2.5 font-mono text-[13px] text-ink outline-none focus:border-ink"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button variant="primary" onClick={save} disabled={pending}>
          {saved ? "Saved" : pending ? "Saving..." : "Save"}
        </Button>
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="text-[12.5px] text-ink-faint transition-base hover:text-ink"
        >
          Reset to default
        </button>
      </div>
    </section>
  );
}
