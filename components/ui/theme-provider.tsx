"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Wraps next-themes' ThemeProvider.
 * Uses class strategy so `.dark` class on <html> drives CSS variables.
 * `suppressHydrationWarning` is on <html> in layout.tsx (required for
 * next-themes to avoid a flash of wrong theme).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  );
}
