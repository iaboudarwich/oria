import Link from "next/link";
import { ORIA_PATH, ORIA_VIEWBOX } from "@/lib/brand/wordmark-path";

type WordmarkProps = {
  href?: string;
  className?: string;
  tone?: "ink" | "ivory";
  onClick?: () => void;
};

/**
 * The Oria wordmark: the real Newsreader "Oria" lockup, drawn as an inline
 * vector path (lib/brand/wordmark-path.ts) so it renders the serif everywhere
 * with no font in the bundle, recolors via currentColor (tone ink / ivory), and
 * scales crisply. Latin mark, so it stays upright under RTL. Square / icon
 * contexts use the "O" monogram instead (see scripts/generate-icons.mjs).
 *
 * Sizing is by height: pass `className` (e.g. `h-6`) to override the default.
 */
export function Wordmark({
  href = "/",
  className = "",
  tone = "ink",
  onClick,
}: WordmarkProps) {
  const color = tone === "ivory" ? "text-surface" : "text-ink";

  // Wrapped in the link, the link carries the accessible name and the mark is
  // decorative; standalone, the mark names itself.
  const mark = (named: boolean) => (
    <svg
      viewBox={ORIA_VIEWBOX}
      fill="currentColor"
      role={named ? "img" : undefined}
      aria-label={named ? "Oria" : undefined}
      aria-hidden={named ? undefined : true}
      className={`h-5 w-auto ${color} ${className}`}
    >
      <path d={ORIA_PATH} />
    </svg>
  );

  if (!href) return mark(true);
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-label="Oria home"
      className="inline-flex items-center"
    >
      {mark(false)}
    </Link>
  );
}
