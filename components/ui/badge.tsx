import type { ReactNode } from "react";

type Tone = "neutral" | "champagne" | "sage" | "claret" | "sand";

const tones: Record<Tone, string> = {
  neutral: "bg-ink/[0.05] text-ink-soft",
  champagne: "bg-accent-soft/60 text-[#7a5a2a]",
  sage: "bg-sage/15 text-[#3f5240]",
  claret: "bg-claret/10 text-claret",
  sand: "bg-sand text-ink-soft",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "champagne" }: { tone?: Tone }) {
  const map: Record<Tone, string> = {
    neutral: "bg-ink-faint",
    champagne: "bg-accent",
    sage: "bg-sage",
    claret: "bg-claret",
    sand: "bg-ink-muted",
  };
  return <span className={`h-1.5 w-1.5 rounded-full ${map[tone]}`} />;
}
