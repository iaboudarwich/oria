import "server-only";

import { getAnthropic, getModel } from "@/lib/ai/anthropic";

/** Detected item types stored on email_detected_items.item_type. */
export type DetectedItemType =
  | "receipt"
  | "bill"
  | "subscription"
  | "flight"
  | "booking"
  | "appointment"
  | "other";

export type ScannedEmail = {
  id: string;
  subject: string;
  sender: string;
  date: string | null;
  snippet: string;
  body: string;
};

/**
 * Structured fields extracted from one email. Stored as `extracted` jsonb.
 * Flat by design: only the fields relevant to the detected type are filled,
 * the rest stay null. `period`, `renewal_date`, `event_date`, `amount`,
 * `currency`, `vendor`, `title`, `summary` are the shared keys the approval
 * and routing layers read.
 */
export type EmailClassification = {
  item_type: DetectedItemType;
  is_relevant: boolean;
  confidence: number; // 0..1
  title: string;
  vendor?: string | null;
  amount?: number | null;
  currency?: string | null;
  summary?: string | null;
  // Recurring (subscriptions, recurring bills)
  period?: "weekly" | "monthly" | "quarterly" | "annually" | "once" | null;
  renewal_date?: string | null; // YYYY-MM-DD next charge / renewal
  // Dated event (flights, bookings, appointments)
  event_date?: string | null; // YYYY-MM-DD (or ISO datetime)
  // Receipt
  order_id?: string | null;
  item_description?: string | null;
  // Bill
  due_date?: string | null; // YYYY-MM-DD
  account?: string | null;
  period_covered?: string | null;
  // Flight
  airline?: string | null;
  flight_number?: string | null;
  origin?: string | null;
  destination?: string | null;
  departure?: string | null; // ISO datetime
  arrival?: string | null; // ISO datetime
  passenger?: string | null;
  // Booking
  booking_type?: string | null; // hotel | rental | restaurant | event | ride
  location?: string | null;
  // Appointment
  provider?: string | null;
  appointment_type?: string | null; // medical | professional | other
};

const TYPES = "receipt, bill, subscription, flight, booking, appointment, other";

/**
 * Classify a single email into a structured detected item via Haiku.
 * Errs toward assigning a real category (the threshold and the user filter
 * downstream, not this prompt); only newsletters / personal mail / pure
 * notifications come back is_relevant=false.
 * Never throws; returns null on any failure so a scan keeps going.
 */
export async function classifyEmail(
  email: ScannedEmail,
): Promise<EmailClassification | null> {
  const anthropic = getAnthropic();
  if (!anthropic) return null;

  const prompt = `You read one email and classify it into something a person may want to track. Be decisive: modern inboxes are full of transactional mail and most of it is worth surfacing.

From: ${email.sender}
Subject: ${email.subject}
Date: ${email.date ?? "unknown"}
Body:
${email.body.slice(0, 2500) || email.snippet}

Categories and what counts:
- receipt: orders, invoices, "thank you for your purchase", payment receipts, refunds. Modern e-commerce order confirmations ARE receipts.
- bill: utility statements, credit card / bank statements, account statements, payment-due notices.
- subscription: recurring charges, renewals, plan changes, free-trial conversions. Auto-renewal notices ARE subscriptions.
- flight: boarding passes, e-tickets, flight confirmations, schedule changes.
- booking: hotels, rentals, restaurant reservations, event tickets, ride confirmations.
- appointment: medical, professional-services, or scheduling confirmations.
- other: everything else, including ambiguous.

Rules:
- Default to a real category even with partial confidence. Use "other" ONLY when you genuinely cannot tell.
- Set is_relevant=false for newsletters, marketing blasts with no purchase, personal mail, and pure notifications. When is_relevant is false, use item_type "other".
- confidence reflects how sure you are of the category (0.0 to 1.0).

Return ONLY valid JSON with these keys (use null when unknown):
{
  "item_type": one of [${TYPES}],
  "is_relevant": true or false,
  "confidence": 0.0 to 1.0,
  "title": "short human title, e.g. 'Amazon order' or 'Flight to Paris'",
  "vendor": "company / provider name or null",
  "amount": number or null,
  "currency": "USD" | "EUR" | ... or null,
  "summary": "1 short sentence or null",
  "period": "weekly" | "monthly" | "quarterly" | "annually" | "once" or null,
  "renewal_date": "YYYY-MM-DD or null (next charge/renewal for subscriptions and recurring bills)",
  "event_date": "YYYY-MM-DD or null (flight departure, booking/appointment date)",
  "order_id": "string or null (receipts)",
  "item_description": "string or null (what was purchased)",
  "due_date": "YYYY-MM-DD or null (bills)",
  "account": "string or null (bill account / last4)",
  "period_covered": "string or null (statement period)",
  "airline": "string or null",
  "flight_number": "string or null",
  "origin": "string or null",
  "destination": "string or null",
  "departure": "ISO datetime or null",
  "arrival": "ISO datetime or null",
  "passenger": "string or null",
  "booking_type": "hotel | rental | restaurant | event | ride or null",
  "location": "string or null",
  "provider": "string or null (appointment provider)",
  "appointment_type": "medical | professional | other or null"
}`;

  try {
    const msg = await anthropic.messages.create({
      model: getModel(),
      max_tokens: 700,
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
