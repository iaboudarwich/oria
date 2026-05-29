"use client";

import { useTheme } from "next-themes";

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="5"/>
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
    </svg>
  );
}

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
