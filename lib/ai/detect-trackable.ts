import "server-only";
import { getAnthropic, getModel } from "@/lib/ai/anthropic";

export type TrackableCategory =
  | "insurance" | "subscription" | "lease" | "membership"
  | "certification" | "id_document" | "contract" | "warranty" | "other";

export type TrackableDetectionResult = {
  is_trackable: boolean;
  category?: TrackableCategory;
  title?: string;
  vendor?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  renewal_date?: string | null;
  cost_amount?: number | null;
  cost_currency?: string | null;
  cost_period?: string | null;
  summary?: string | null;
};

/** Default lead times by category (days before renewal_date). */
export const TRACKABLE_LEAD_DAYS: Record<TrackableCategory, number> = {
  insurance:     90,
  lease:         90,
  id_document:   60,
  certification: 60,
  contract:      60,
  membership:    30,
  warranty:      30,
  subscription:  14,
  other:         30,
};

/**
 * Detect whether a document is a trackable item (has renewal/expiry date).
 * Runs as an extra pass after primary extraction.
 * Returns is_trackable=false for non-trackable documents (e.g. grocery receipts).
 */
export async function detectTrackable(
  textPreview: string,
  primaryDocType: string,
  extractedFields: Record<string, unknown>,
): Promise<TrackableDetectionResult> {
  const anthropic = getAnthropic();
  if (!anthropic) return { is_trackable: false };

  const categoryList = Object.keys(TRACKABLE_LEAD_DAYS).join(", ");

  const prompt = `You analyze documents to detect trackable items that have renewal or expiry dates.

Document type: ${primaryDocType}
Extracted fields: ${JSON.stringify(extractedFields, null, 2).slice(0, 500)}
Document text preview:
${textPreview.slice(0, 1500)}

Determine if this document represents something that RENEWS or EXPIRES and should be tracked.

Examples of TRACKABLE: insurance policy, Netflix subscription, driver's license, software license, lease agreement, gym membership, professional certification, warranty.
Examples of NOT TRACKABLE: grocery receipt, restaurant receipt, bank transaction, general letter.

Return ONLY valid JSON:
{
  "is_trackable": true or false,
  "category": one of [${categoryList}],
  "title": "short descriptive title",
  "vendor": "provider or company name",
  "starts_at": "YYYY-MM-DD or null",
  "ends_at": "YYYY-MM-DD or null",
  "renewal_date": "YYYY-MM-DD or null",
  "cost_amount": number or null,
  "cost_currency": "USD" or null,
  "cost_period": "monthly" | "annually" | "once" | "quarterly" | "semi_annually" or null,
  "summary": "1 sentence description or null"
}

If is_trackable is false, you can omit other fields or set them to null.`;

  try {
    const msg = await anthropic.messages.create({
      model: getModel(),
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const raw =
      msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "{}";
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned) as TrackableDetectionResult;
    return parsed;
  } catch {
    return { is_trackable: false };
  }
}
