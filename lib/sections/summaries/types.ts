// Normalized shape every section summary generator returns. The card renders
// this directly, so generators never touch the DOM. Returning null means
// "no summary worth showing" (the page falls back to the empty state or just
// the list).

export type SummaryTone = "default" | "warn" | "good";

export type SummaryMetric = {
  label: string;
  value: string;
  tone?: SummaryTone;
};

export type SummaryBadge = {
  text: string;
  tone: SummaryTone;
};

export type SummaryData = {
  /** Big left-aligned figure. Optional (e.g. a paragraph-only generic card). */
  headline?: { value: string; label: string };
  /** Supporting metrics shown on the right / below. */
  metrics: SummaryMetric[];
  /** Optional alert chips (anomalies, expiries). */
  badges?: SummaryBadge[];
  /** One-line / one-paragraph prose (generic AI summary). */
  note?: string;
  /** Single call to action at the bottom. */
  cta?: { label: string; href: string };
};
