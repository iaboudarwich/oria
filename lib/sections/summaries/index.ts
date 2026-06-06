import "server-only";

import type { SectionRef } from "@/lib/data/all-sections";
import type { SummaryData } from "./types";
import { travelSummary, healthSummary, propertiesSummary, genericSummary } from "./generators";

export type { SummaryData } from "./types";
export { billsSummary } from "./generators";

/**
 * Pick and run the summary generator for a section. Builtin sections with a
 * dedicated generator get the rich version; everything else (other builtins,
 * custom sections) gets the fast structured generic summary. Returns null when
 * there is nothing worth showing.
 */
export async function summaryForSection(
  ref: SectionRef,
  orgId: string,
): Promise<SummaryData | null> {
  if (ref.kind === "review") return null;
  if (ref.kind === "builtin") {
    switch (ref.key) {
      case "travel":
        return travelSummary(orgId);
      case "health":
        return healthSummary(orgId);
      case "properties":
        return propertiesSummary(orgId);
      default:
        return genericSummary(orgId, ref.key);
    }
  }
  return genericSummary(orgId, ref.key);
}
