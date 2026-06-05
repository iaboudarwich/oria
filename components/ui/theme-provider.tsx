"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Wraps next-themes' ThemeProvider.
 *
 * Class strategy: next-themes writes the resolved theme NAME as a class on
 * <html> ("dark" or "light"). globals.css carries the dark palette on :root
 * (the default) and overrides to the warm light palette under `.light`.
 *
 * DARK is the product default (the home-target look). Light is an explicit
 * user toggle, not system-driven, so the app reads the same for everyone until
 * they choose otherwise; the choice persists in localStorage (next-themes).
 * `suppressHydrationWarning` is on <html> in layout.tsx (required for
 * next-themes to avoid a flash of wrong theme).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      themes={["dark", "light"]}
      enableSystem={false}
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  );
}
