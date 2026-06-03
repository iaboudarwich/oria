"use client";

import { useTheme } from "next-themes";
import { SunIcon, MoonIcon, SystemIcon } from "@/components/ui/icon";

/**
 * Three-way theme toggle: light / dark / system.
 * suppressHydrationWarning prevents the flicker when next-themes resolves
 * the theme on the client. the SSR render defaults to no active state
 * and the client immediately corrects it.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const options: Array<{ value: string; label: string; icon: React.ReactNode }> = [
    { value: "light",  label: "Light",  icon: <SunIcon /> },
    { value: "dark",   label: "Dark",   icon: <MoonIcon /> },
    { value: "system", label: "System", icon: <SystemIcon /> },
  ];

  return (
    <div
      suppressHydrationWarning
      className="flex h-9 items-center gap-0.5 rounded-xl border border-line bg-canvas p-0.5"
    >
      {options.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            suppressHydrationWarning
            onClick={() => setTheme(opt.value)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] transition-base ${
              active
                ? "bg-surface-raised text-ink shadow-xs"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            <span className={active ? "text-brand" : ""}>{opt.icon}</span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
