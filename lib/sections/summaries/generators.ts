import "server-only";

import { createClient } from "@/lib/supabase/server";
import { money, shortDate as fmtDate } from "@/lib/sections/format";
import type { SummaryData } from "./types";

// ── shared utils ─────────────────────────────────────────────────────────────

function daysUntil(iso: string): number {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return Number.POSITIVE_INFINITY;
  return Math.ceil((d - Date.now()) / 86_400_000);
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function monthBounds(now = new Date()): { start: string; prevStart: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  return { start, prevStart };
}

type EntityRow = { doc_type: string; fields: Record<string, unknown> };

async function extractedByDocType(
  orgId: string,
  docTypes: string[],
): Promise<EntityRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("extracted_entities")
    .select("doc_type, fields")
    .eq("organization_id", orgId)
    .in("doc_type", docTypes);
  return (data ?? []) as EntityRow[];
}

// ── Travel ───────────────────────────────────────────────────────────────────

export async function travelSummary(orgId: string): Promise<SummaryData | null> {
  try {
    const flights = await extractedByDocType(orgId, ["flight"]);
    const upcoming = flights
      .map((f) => ({
        when: str(f.fields.departure_datetime),
        dest: str(f.fields.destination_airport) || str(f.fields.airline),
        flight: str(f.fields.flight_number),
      }))
      .filter((f) => f.when && daysUntil(f.when) >= 0)
      .sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());

    const metrics: SummaryData["metrics"] = [];
    const badges: SummaryData["badges"] = [];
    let headline: SummaryData["headline"];

    const next = upcoming[0];
    if (next) {
      const d = daysUntil(next.when);
      headline = {
        value: d <= 0 ? "Today" : `${d} ${d === 1 ? "day" : "days"}`,
        label: next.dest ? `Until your trip to ${next.dest}` : "Until your next trip",
      };
      metrics.push({ label: "Departure", value: fmtDate(next.when) });
      if (next.flight) metrics.push({ label: "Flight", value: next.flight });
    }

    // Passport / id-document expiry warnings from trackables.
    const supabase = await createClient();
    const { data: docs } = await supabase
      .from("trackables")
      .select("title, renewal_date, category")
      .eq("organization_id", orgId)
      .eq("category", "id_document")
      .not("renewal_date", "is", null);
    for (const row of (docs ?? []) as Array<{ title: string; renewal_date: string }>) {
      const d = daysUntil(row.renewal_date);
      if (d >= 0 && d <= 180) {
        badges.push({
          text: `${row.title || "Travel document"} expires ${fmtDate(row.renewal_date)}`,
          tone: "warn",
        });
      }
    }

    if (!headline && badges.length === 0) return null;
    return {
      headline,
      metrics,
      badges,
      cta: { label: "See trips", href: "/dashboard/sections/travel?view=trips" },
    };
  } catch {
    return null;
  }
}

// ── Health ─────────────────────────────────────────────────────────────────

export async function healthSummary(orgId: string): Promise<SummaryData | null> {
  try {
    const supabase = await createClient();
    const nowIso = new Date().toISOString();

    // Upcoming appointments: future-dated items filed to Health.
    const { data: appts } = await supabase
      .from("memory_items")
      .select("title, occurred_at")
      .eq("organization_id", orgId)
      .eq("section", "health")
      .is("deleted_at", null)
      .gte("occurred_at", nowIso)
      .order("occurred_at", { ascending: true })
      .limit(3);
    const appointments = (appts ?? []) as Array<{ title: string; occurred_at: string }>;

    // Prescriptions on file; flag refills due within 30 days (fill_date + 30).
    const rx = await extractedByDocType(orgId, ["prescription"]);
    let refillsSoon = 0;
    for (const r of rx) {
      const fill = str(r.fields.fill_date);
      if (!fill) continue;
      const due = new Date(fill);
      due.setDate(due.getDate() + 30);
      const d = daysUntil(due.toISOString());
      if (d >= 0 && d <= 30) refillsSoon += 1;
    }

    if (appointments.length === 0 && rx.length === 0) return null;

    const metrics: SummaryData["metrics"] = [];
    const badges: SummaryData["badges"] = [];
    let headline: SummaryData["headline"];

    const nextAppt = appointments[0];
    if (nextAppt) {
      const d = daysUntil(nextAppt.occurred_at);
      headline = {
        value: d <= 0 ? "Today" : `${d} ${d === 1 ? "day" : "days"}`,
        label: `Until ${nextAppt.title}`,
      };
    }
    if (appointments.length > 0) {
      metrics.push({
        label: "Upcoming appointments",
        value: String(appointments.length),
      });
    }
    if (rx.length > 0) {
      metrics.push({ label: "Prescriptions on file", value: String(rx.length) });
    }
    if (refillsSoon > 0) {
      badges.push({
        text: `${refillsSoon} refill${refillsSoon === 1 ? "" : "s"} due in 30 days`,
        tone: "warn",
      });
    }

    return {
      headline,
      metrics,
      badges,
      cta: { label: "View timeline", href: "/dashboard/health?tab=vitals" },
    };
  } catch {
    return null;
  }
}

// ── Properties ───────────────────────────────────────────────────────────────

export async function propertiesSummary(orgId: string): Promise<SummaryData | null> {
  try {
    const supabase = await createClient();

    // Count property entities.
    const { data: types } = await supabase
      .from("entity_types")
      .select("id, key")
      .eq("organization_id", orgId)
      .eq("key", "property")
      .maybeSingle();
    let propertyCount = 0;
    if (types && (types as { id: string }).id) {
      const { count } = await supabase
        .from("entities")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("entity_type_id", (types as { id: string }).id)
        .is("archived_at", null);
      propertyCount = count ?? 0;
    }

    // Lease renewals in next 90 days.
    const leases = await extractedByDocType(orgId, ["lease"]);
    let renewing = 0;
    for (const l of leases) {
      const end = str(l.fields.end_date);
      if (!end) continue;
      const d = daysUntil(end);
      if (d >= 0 && d <= 90) renewing += 1;
    }

    // Rent collected this month: inflows filed to Properties this month.
    const { start } = monthBounds();
    const { data: rentRows } = await supabase
      .from("memory_items")
      .select("amount_normalized, amount_currency")
      .eq("organization_id", orgId)
      .eq("section", "properties")
      .is("deleted_at", null)
      .gte("occurred_at", start);
    let rent = 0;
    let cur = "USD";
    for (const r of (rentRows ?? []) as Array<{
      amount_normalized: number | null;
      amount_currency: string | null;
    }>) {
      if (typeof r.amount_normalized === "number") rent += r.amount_normalized;
      if (r.amount_currency) cur = r.amount_currency;
    }

    if (propertyCount === 0 && leases.length === 0 && rent === 0) return null;

    const metrics: SummaryData["metrics"] = [];
    if (rent > 0) metrics.push({ label: "Rent this month", value: money(rent, cur) });
    metrics.push({
      label: "Leases renewing (90d)",
      value: String(renewing),
      tone: renewing > 0 ? "warn" : "default",
    });

    return {
      headline:
        propertyCount > 0
          ? {
              value: String(propertyCount),
              label: propertyCount === 1 ? "Property" : "Properties",
            }
          : undefined,
      metrics,
      cta: { label: "View properties", href: "/dashboard/things" },
    };
  } catch {
    return null;
  }
}

// ── Bills (smart section) ────────────────────────────────────────────────────

export async function billsSummary(orgId: string): Promise<SummaryData | null> {
  try {
    const supabase = await createClient();
    const { start, prevStart } = monthBounds();
    const nowIso = new Date().toISOString();

    const { data: rows } = await supabase
      .from("memory_items")
      .select("merchant, amount_normalized, amount_currency, occurred_at")
      .eq("organization_id", orgId)
      .eq("smart_section", "bills")
      .is("deleted_at", null)
      .gte("occurred_at", prevStart);
    const bills = (rows ?? []) as Array<{
      merchant: string | null;
      amount_normalized: number | null;
      amount_currency: string | null;
      occurred_at: string | null;
    }>;
    if (bills.length === 0) return null;

    let thisMonth = 0;
    let lastMonth = 0;
    let cur = "USD";
    // Per-merchant month-over-month for the anomaly check.
    const byMerchant = new Map<string, { now: number; prev: number }>();
    for (const b of bills) {
      if (!b.occurred_at || typeof b.amount_normalized !== "number") continue;
      if (b.amount_currency) cur = b.amount_currency;
      const inThis = b.occurred_at >= start;
      if (inThis) thisMonth += b.amount_normalized;
      else lastMonth += b.amount_normalized;
      const key = (b.merchant ?? "other").toLowerCase();
      const e = byMerchant.get(key) ?? { now: 0, prev: 0 };
      if (inThis) e.now += b.amount_normalized;
      else e.prev += b.amount_normalized;
      byMerchant.set(key, e);
    }

    const metrics: SummaryData["metrics"] = [];
    const badges: SummaryData["badges"] = [];

    if (lastMonth > 0) {
      const deltaAbs = thisMonth - lastMonth;
      const deltaPct = Math.round((deltaAbs / lastMonth) * 100);
      metrics.push({
        label: "vs last month",
        value: `${deltaAbs >= 0 ? "+" : ""}${money(deltaAbs, cur)} (${deltaPct >= 0 ? "+" : ""}${deltaPct}%)`,
        tone: deltaAbs > 0 ? "warn" : "good",
      });
    }

    // Next 3 payments due (future-dated bills).
    const upcoming = bills
      .filter((b) => b.occurred_at && b.occurred_at >= nowIso)
      .sort((a, b) => (a.occurred_at! < b.occurred_at! ? -1 : 1))
      .slice(0, 3);
    if (upcoming.length > 0) {
      metrics.push({
        label: "Next due",
        value: `${upcoming[0].merchant ?? "Payment"} ${fmtDate(upcoming[0].occurred_at!)}`,
      });
    }

    // Anomaly: any merchant whose spend moved more than 20% month-over-month.
    for (const [merchant, e] of byMerchant) {
      if (e.prev > 0 && Math.abs(e.now - e.prev) / e.prev > 0.2 && e.now > 0) {
        const pct = Math.round(((e.now - e.prev) / e.prev) * 100);
        badges.push({
          text: `${merchant} ${pct > 0 ? "up" : "down"} ${Math.abs(pct)}%`,
          tone: "warn",
        });
      }
    }

    return {
      headline: { value: money(thisMonth, cur), label: "Spent this month" },
      metrics,
      badges: badges.slice(0, 3),
      cta: { label: "View spend", href: "/dashboard/bills?view=spend" },
    };
  } catch {
    return null;
  }
}

// ── Generic (structured, fast) ───────────────────────────────────────────────
//
// PERF NOTE: the brief calls for an AI-generated paragraph here, cached 24h.
// An AI call in the section render path risks a TTFB regression (hard rule
// #1), so the default is a fast structured summary computed from the rows we
// already have. The AI-paragraph variant can layer on later behind
// unstable_cache without changing this contract.

export async function genericSummary(
  orgId: string,
  sectionKey: string,
): Promise<SummaryData | null> {
  try {
    const supabase = await createClient();
    const isCustom = /^[0-9a-f-]{36}$/i.test(sectionKey);
    let q = supabase
      .from("uploads")
      .select("created_at")
      .eq("organization_id", orgId)
      .is("deleted_at", null);
    q = isCustom ? q.eq("custom_section_id", sectionKey) : q.eq("section", sectionKey);
    const { data } = await q.order("created_at", { ascending: false }).limit(500);
    const rows = (data ?? []) as Array<{ created_at: string }>;
    if (rows.length === 0) return null;

    const latest = rows[0].created_at;
    const oldest = rows[rows.length - 1].created_at;
    const span =
      rows.length > 1
        ? `${fmtDate(oldest)} to ${fmtDate(latest)}`
        : fmtDate(latest);

    return {
      headline: { value: String(rows.length), label: rows.length === 1 ? "item" : "items" },
      metrics: [{ label: "Spanning", value: span }],
      note: `Last added ${fmtDate(latest)}.`,
    };
  } catch {
    return null;
  }
}
