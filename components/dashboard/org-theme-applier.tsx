"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

/**
 * Per-org light/dark override (Round 14.5 F4). The global theme is owned by
 * next-themes (the `.dark` class on <html>). When the active space sets a
 * theme_variant, that wins for the space:
 *   - "light" / "dark": force it.
 *   - "system": follow prefers-color-scheme.
 *   - null: inherit the user's global theme (follow next-themes' resolvedTheme).
 *
 * We toggle the same `.dark` / `.light` classes next-themes uses (dark is the
 * :root default, light overrides under `.light`), so accent and every token
 * cascade correctly. Switching spaces re-renders the layout, which re-runs this.
 */
export function OrgThemeApplier({ variant }: { variant: "light" | "dark" | "system" | null }) {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = () =>
      typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

    function apply() {
      let dark: boolean;
      if (variant === "dark") dark = true;
      else if (variant === "light") dark = false;
      else if (variant === "system") dark = prefersDark();
      else dark = resolvedTheme !== "light"; // inherit the global theme (dark default)
      // Keep the two-class model in lockstep: exactly one of dark/light is set.
      root.classList.toggle("dark", dark);
      root.classList.toggle("light", !dark);
    }

    apply();

    if (variant === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [variant, resolvedTheme]);

  return null;
}
