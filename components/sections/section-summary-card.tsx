import { Button } from "@/components/ui/button";
import type { SummaryData, SummaryTone } from "@/lib/sections/summaries/types";

const TONE_TEXT: Record<SummaryTone, string> = {
  default: "text-ink",
  warn: "text-claret",
  good: "text-brand",
};

const BADGE_TONE: Record<SummaryTone, string> = {
  default: "bg-canvas text-ink-muted",
  warn: "bg-claret/10 text-claret",
  good: "bg-brand-soft text-brand",
};

/**
 * The single summary card shown above a section's list. Headline figure on
 * the left, supporting metrics on the right, optional alert badges, optional
 * prose note, and one call-to-action at the bottom. Scannable in ~3 seconds.
 * Pure presentational: the per-template generator produced the SummaryData.
 */
export function SectionSummaryCard({ data }: { data: SummaryData }) {
  return (
    <div className="mb-6 rounded-2xl border border-line bg-surface-raised p-5 shadow-[0_1px_2px_rgba(28,26,23,0.04),0_2px_8px_-6px_rgba(28,26,23,0.08)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {data.headline ? (
          <div className="min-w-0">
            <p className="text-display text-ink">{data.headline.value}</p>
            <p className="text-body-sm mt-0.5 text-ink-muted">{data.headline.label}</p>
          </div>
        ) : null}

        {data.metrics.length > 0 ? (
          <dl className="flex flex-wrap gap-x-6 gap-y-2 sm:justify-end">
            {data.metrics.map((m, i) => (
              <div key={i} className="min-w-0">
                <dt className="text-caption text-ink-faint">{m.label}</dt>
                <dd className={`text-body font-medium ${TONE_TEXT[m.tone ?? "default"]}`}>
                  {m.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      {data.note ? <p className="text-body mt-3 text-ink-soft">{data.note}</p> : null}

      {data.badges && data.badges.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.badges.map((b, i) => (
            <span
              key={i}
              className={`text-body-sm inline-flex items-center rounded-full px-2.5 py-1 font-medium ${BADGE_TONE[b.tone]}`}
            >
              {b.text}
            </span>
          ))}
        </div>
      ) : null}

      {data.cta ? (
        <div className="mt-4">
          <Button href={data.cta.href} variant="secondary" size="sm">
            {data.cta.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
