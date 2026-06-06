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
 * DARK is the product default (the home-target look). The user can choose
 * Dark / Light / System in Settings -> Appearance; System follows the OS via
 * prefers-color-scheme. The choice persists in localStorage (next-themes, the
 * no-flash authority) and is also written to user_preferences for the record.
 * `suppressHydrationWarning` is on <html> in layout.tsx (required for
 * next-themes to avoid a flash of wrong theme).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      themes={["dark", "light"]}
      enableSystem
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  );
}
