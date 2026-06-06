import type { ReactNode } from "react";
import { Accordion } from "@/components/ui/accordion";

/**
 * Insight-led card: the WHOOP "Voice of WHOOP" ordering, made the house style.
 *   1. a plain-language INSIGHT line on top (what it means, in words),
 *   2. the EVIDENCE under it (a number, ring, or chart),
 *   3. the raw DETAIL collapsed below (expand in place via the Accordion).
 * Insight first, jargon never. The detail stays one tap away, not in your face.
 */
export function InsightCard({
  insight,
  evidence,
  detail,
  detailLabel,
  detailHint,
  className = "",
}: {
  insight: ReactNode;
  evidence?: ReactNode;
  detail?: ReactNode;
  detailLabel?: string;
  detailHint?: string;
  className?: string;
}) {
  return (
    <section
      className={`space-y-3 rounded-2xl border border-line bg-surface-raised p-4 ${className}`}
    >
      <p className="text-[14px] leading-snug text-ink">{insight}</p>
      {evidence ? <div>{evidence}</div> : null}
      {detail && detailLabel ? (
        <div className="border-t border-line pt-2">
          <Accordion label={detailLabel} hint={detailHint}>
            {detail}
          </Accordion>
        </div>
      ) : null}
    </section>
  );
}
