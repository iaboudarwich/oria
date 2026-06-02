import "server-only";

import { getAnthropic, getModel } from "@/lib/ai/anthropic";

/** Detected item types stored on email_detected_items.item_type. */
export type DetectedItemType =
  | "subscription"
  | "bill"
  | "flight"
  | "booking"
  | "receipt"
  | "other";

export type ScannedEmail = {
  id: string;
  subject: string;
  sender: string;
  date: string | null;
  snippet: string;
  body: string;
};

/** Structured fields extracted from one email. Stored as `extracted` jsonb. */
export type EmailClassification = {
  item_type: DetectedItemType;
  is_relevant: boolean;
  confidence: number; // 0..1
  title: string;
  vendor?: string | null;
  amount?: number | null;
  currency?: string | null;
  period?: "monthly" | "annually" | "quarterly" | "weekly" | "once" | null;
  renewal_date?: string | null; // YYYY-MM-DD
  event_date?: string | null; // flight/booking date, YYYY-MM-DD
  summary?: string | null;
};

const TYPES = "subscription, bill, flight, booking, receipt, other";

/**
 * Classify a single email into a structured detected item via Haiku.
 * Returns is_relevant=false for newsletters, personal mail, and anything
 * that is not a subscription / bill / flight / booking / receipt.
 * Never throws; returns null on any failure so a scan keeps going.
 */
export async function classifyEmail(
  email: ScannedEmail,
): Promise<EmailClassification | null> {
  const anthropic = getAnthropic();
  if (!anthropic) return null;

  const prompt = `You classify emails to surface things a person may want to track: subscriptions, bills, flights, bookings (hotels/reservations), and receipts.

From: ${email.sender}
Subject: ${email.subject}
Date: ${email.date ?? "unknown"}
Body:
${email.body.slice(0, 2500) || email.snippet}

Decide the single best item_type from [${TYPES}].
Set is_relevant=false for newsletters, marketing, personal mail, notifications, and anything not worth tracking. When is_relevant is false, use item_type "other".

Return ONLY valid JSON:
{
  "item_type": one of [${TYPES}],
  "is_relevant": true or false,
  "confidence": 0.0 to 1.0,
  "title": "short human title, e.g. 'Netflix subscription' or 'Flight to Paris'",
  "vendor": "company / provider name or null",
  "amount": number or null,
  "currency": "USD" | "EUR" | ... or null,
  "period": "monthly" | "annually" | "quarterly" | "weekly" | "once" or null,
  "renewal_date": "YYYY-MM-DD or null (next charge/renewal for subscriptions and bills)",
  "event_date": "YYYY-MM-DD or null (departure for flights, check-in for bookings)",
  "summary": "1 short sentence or null"
}`;

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
    const parsed = JSON.parse(cleaned) as EmailClassification;
    if (!parsed || typeof parsed.item_type !== "string") return null;
    // Clamp confidence into range.
    parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
    return parsed;
  } catch {
    return null;
  }
}
