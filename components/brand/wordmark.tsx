import Link from "next/link";

type WordmarkProps = {
  href?: string;
  className?: string;
  tone?: "ink" | "ivory";
};

export function Wordmark({ href = "/", className = "", tone = "ink" }: WordmarkProps) {
  const color = tone === "ivory" ? "text-surface" : "text-ink";

  const inner = (
    <span className={`inline-flex items-center gap-2 ${color} ${className}`}>
      <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-lg bg-ink text-surface">
        <span className="text-[12px] font-semibold leading-none">O</span>
      </span>
      <span className="text-[17px] font-semibold tracking-tight">Oria</span>
    </span>
  );

  if (!href) return inner;
  return (
    <Link href={href} className="inline-flex items-center" aria-label="Oria home">
      {inner}
    </Link>
  );
}
