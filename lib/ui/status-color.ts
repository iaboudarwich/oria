/**
 * One meaning per color. This is the SINGLE source for status color across the
 * surfaces, so an accent never means two different things. Every status surface
 * (health dials, connection dots, due states, finance deltas) maps its semantic
 * status through here instead of inlining a token, which keeps the palette
 * honest (heuristics: color discipline).
 *
 * Fixed meanings (from the @theme tokens in app/globals.css):
 *   good     -> success (sage green)     "on track / healthy / paid / positive"
 *   warn     -> warning (gold)           "needs attention soon"
 *   bad      -> claret (muted red)       "overdue / problem / negative"
 *   info     -> brand (warm indigo)      "active / current / informational"
 *   neutral  -> ink-faint                "no signal / inactive"
 */
export type StatusTone = "good" | "warn" | "bad" | "info" | "neutral";

/** A solid dot / fill (e.g. a connection health dot, a ring track fill). */
export const STATUS_DOT: Record<StatusTone, string> = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-claret",
  info: "bg-brand",
  neutral: "bg-ink-faint",
};

/** Text in the status color. */
export const STATUS_TEXT: Record<StatusTone, string> = {
  good: "text-success",
  warn: "text-warning",
  bad: "text-claret",
  info: "text-brand",
  neutral: "text-ink-faint",
};

/** The raw CSS var, for inline SVG stroke/fill (e.g. ScoreRing). */
export const STATUS_VAR: Record<StatusTone, string> = {
  good: "var(--success)",
  warn: "var(--warning)",
  bad: "var(--claret)",
  info: "var(--brand)",
  neutral: "var(--ink-faint)",
};

/** A 0-100 score to a tone: low = needs attention, mid = soon, high = good. */
export function toneForScore(score: number): StatusTone {
  if (score >= 67) return "good";
  if (score >= 34) return "warn";
  return "bad";
}
