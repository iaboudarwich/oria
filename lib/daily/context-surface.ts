import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * F7: the per-context Today surface (hero + chart + ticker). The same product,
 * shaped to who the user is. One reusable chart and one reusable ticker render
 * every archetype; this module resolves which archetype the active space is and
 * loads the REAL data each one leads with. When the data is thin, the caller
 * shows a calm empty state. Nothing is fabricated.
 */

export type ContextArchetype = "personal" | "investor" | "business" | "family_office";

export type ChartPoint = { label: string; value: number };
export type TickerItem = { label: string; value: string };

export type ContextSurface = {
  archetype: ContextArchetype;
  hero: { stat: string; statLabel: string };
  chart: { kind: "bar" | "line"; points: ChartPoint[]; caption: string } | null;
  ticker: TickerItem[];
};

/**
 * Work templates whose archetype is a Business (not a Family Office). Founder
 * and freelancer both provision the "freelancer" key; teacher provisions
 * "teacher". A family office work org carries no business work-template, so it
 * falls through to the Family Office surface.
 */
const BUSINESS_WORK_TEMPLATES = new Set(["freelancer", "teacher"]);

/**
 * Map a space to one of the four user-facing contexts.
 *
 * Both a family office and a business (founder / freelancer / teacher) are
 * work-area orgs tagged kind="office", parent_kind="work", so a blanket
 * `kind==="office" -> family_office` made Business unreachable. We resolve a
 * recognized business work-template to Business FIRST; an unsignaled office org
 * (the genuine family office, keyed "custom") stays Family Office. The primary
 * work org carries its intent's template_key (see lib/onboarding/plan-executor).
 */
export function resolveContextArchetype(org: {
  kind?: string | null;
  parent_kind?: string | null;
  template_key?: string | null;
}): ContextArchetype {
  // Investor lives on the personal org, keyed explicitly.
  if (org.template_key === "investor") return "investor";
  if (org.parent_kind === "work" || org.kind === "office") {
    return BUSINESS_WORK_TEMPLATES.has(org.template_key ?? "")
      ? "business"
      : "family_office";
  }
  return "personal";
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayLabel(d: Date): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
}
function monthLabel(d: Date): string {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    d.getUTCMonth()
  ];
}

export async function loadContextSurface(
  organizationId: string,
  org: { kind?: string | null; parent_kind?: string | null; template_key?: string | null },
  now: Date,
): Promise<ContextSurface> {
  const admin = createAdminClient();
  const archetype = resolveContextArchetype(org);

  // Shared pulls used across archetypes.
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (archetype === "investor" || archetype === "business") {
    // Spend trend over the last six months, from finance/bills memory items.
    const since = new Date(todayStart.getTime() - 183 * DAY_MS).toISOString();
    const [spendRes, trackRes] = await Promise.all([
      admin
        .from("memory_items")
        .select("amount_normalized, occurred_at, smart_section")
        .eq("organization_id", organizationId)
        .in("smart_section", ["finance", "bills"])
        .gte("occurred_at", since),
      admin
        .from("trackables")
        .select("title, renewal_date, category")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .not("renewal_date", "is", null)
        .gte("renewal_date", todayStart.toISOString().slice(0, 10))
        .order("renewal_date", { ascending: true })
        .limit(8),
    ]);

    const byMonth = new Map<string, number>();
    let total = 0;
    for (const r of spendRes.data ?? []) {
      const amt = r.amount_normalized === null ? 0 : Number(r.amount_normalized);
      const when = new Date(r.occurred_at as string);
      const key = `${when.getUTCFullYear()}-${when.getUTCMonth()}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + amt);
      total += amt;
    }
    const points: ChartPoint[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = `${m.getUTCFullYear()}-${m.getUTCMonth()}`;
      points.push({ label: monthLabel(m), value: Math.round(byMonth.get(key) ?? 0) });
    }
    const ticker: TickerItem[] = (trackRes.data ?? []).map((t) => ({
      label: (t.title as string) ?? "Trackable",
      value: t.renewal_date as string,
    }));

    return {
      archetype,
      hero: {
        stat: total > 0 ? Math.round(total).toLocaleString() : "0",
        statLabel: archetype === "investor" ? "six_month_outflow" : "six_month_spend",
      },
      chart: points.some((p) => p.value > 0)
        ? { kind: "line", points, caption: "spend_caption" }
        : null,
      ticker,
    };
  }

  if (archetype === "family_office") {
    // Trackables by category, plus the nearest renewals.
    const [trackRes, renewRes] = await Promise.all([
      admin
        .from("trackables")
        .select("category")
        .eq("organization_id", organizationId)
        .is("archived_at", null),
      admin
        .from("trackables")
        .select("title, renewal_date")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .not("renewal_date", "is", null)
        .gte("renewal_date", todayStart.toISOString().slice(0, 10))
        .order("renewal_date", { ascending: true })
        .limit(8),
    ]);
    const counts = new Map<string, number>();
    for (const r of trackRes.data ?? []) {
      const c = (r.category as string) ?? "other";
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const points: ChartPoint[] = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, value]) => ({ label, value }));
    const ticker: TickerItem[] = (renewRes.data ?? []).map((t) => ({
      label: (t.title as string) ?? "Trackable",
      value: t.renewal_date as string,
    }));
    return {
      archetype,
      hero: { stat: String(trackRes.data?.length ?? 0), statLabel: "tracked_total" },
      chart: points.length ? { kind: "bar", points, caption: "categories_caption" } : null,
      ticker,
    };
  }

  // Personal: activity over the last seven days + what's next.
  const weekAgo = new Date(todayStart.getTime() - 6 * DAY_MS).toISOString();
  const [filedRes, eventsRes, renewRes] = await Promise.all([
    admin
      .from("uploads")
      .select("created_at")
      .eq("organization_id", organizationId)
      .eq("status", "filed")
      .is("deleted_at", null)
      .gte("created_at", weekAgo),
    admin
      .from("calendar_events")
      .select("title, starts_at")
      .eq("organization_id", organizationId)
      .gte("starts_at", now.toISOString())
      .order("starts_at", { ascending: true })
      .limit(6),
    admin
      .from("trackables")
      .select("title, renewal_date")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .not("renewal_date", "is", null)
      .gte("renewal_date", todayStart.toISOString().slice(0, 10))
      .order("renewal_date", { ascending: true })
      .limit(4),
  ]);
  const byDay = new Map<string, number>();
  for (const r of filedRes.data ?? []) {
    const when = new Date(r.created_at as string);
    const key = when.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  const points: ChartPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart.getTime() - i * DAY_MS);
    points.push({ label: dayLabel(d), value: byDay.get(d.toISOString().slice(0, 10)) ?? 0 });
  }
  const ticker: TickerItem[] = [
    ...(eventsRes.data ?? []).map((e) => ({
      label: (e.title as string) ?? "Event",
      value: new Date(e.starts_at as string).toISOString().slice(5, 10),
    })),
    ...(renewRes.data ?? []).map((t) => ({
      label: (t.title as string) ?? "Trackable",
      value: t.renewal_date as string,
    })),
  ];
  return {
    archetype: "personal",
    hero: { stat: String(filedRes.data?.length ?? 0), statLabel: "filed_this_week" },
    chart: points.some((p) => p.value > 0)
      ? { kind: "bar", points, caption: "activity_caption" }
      : null,
    ticker,
  };
}
