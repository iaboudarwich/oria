import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAnthropic, getModel } from "@/lib/ai/anthropic";
import { resolveWorkspaceOrgs } from "@/lib/integrations/gmail/workspace";
import { listCloudConnectionsByService, markCloudConnectionSynced } from "./cloud-connections";
import { getFreshCloudAccessToken } from "./token-refresh";
import { calendarSync, type SyncedCalendarEvent } from "./sidecar";
import { logAuditEvent } from "@/lib/data/audit-log";
import type { Section } from "@/lib/supabase/types";

export type EventCategory =
  | "travel"
  | "health"
  | "meeting"
  | "personal"
  | "family"
  | "finance"
  | "other";

/** Map a classified event category to the section it files under. */
const CATEGORY_SECTION: Record<EventCategory, Section> = {
  travel: "travel",
  health: "health",
  finance: "finance",
  meeting: "events",
  family: "events",
  personal: "personal",
  other: "personal",
};

// Heuristic signals (the spec's stated defaults). Used as the fast path and as
// the fallback when the AI classifier is unavailable.
const TRAVEL_RE = /\b(flight|flights|hotel|trip|airport|boarding|airbnb|rental car|itinerary)\b/i;
const HEALTH_RE = /\b(doctor|dr\.|dentist|appointment|checkup|check-up|therapy|clinic|medical|surgery|vaccine)\b/i;
const FAMILY_RE = /\b(birthday|anniversary|family|wedding|graduation)\b/i;
const FINANCE_RE = /\b(invoice|payment due|tax|accountant|bill|statement)\b/i;
const AIRPORT_CODE_RE = /\b[A-Z]{3}\b/;

function emailDomain(addr: string | null): string | null {
  if (!addr) return null;
  const at = addr.indexOf("@");
  return at >= 0 ? addr.slice(at + 1).toLowerCase() : null;
}

/** Deterministic categorization from the spec's rules. */
function heuristicCategory(e: SyncedCalendarEvent, userDomain: string | null): EventCategory {
  const hay = `${e.title} ${e.description ?? ""} ${e.location ?? ""}`;
  if (TRAVEL_RE.test(hay) || (e.location && AIRPORT_CODE_RE.test(e.location))) return "travel";
  if (HEALTH_RE.test(hay)) return "health";
  if (FAMILY_RE.test(hay)) return "family";
  if (FINANCE_RE.test(hay)) return "finance";
  // External attendees (a domain other than the organizer's / user's) -> meeting.
  const external = e.attendees.some((a) => {
    const d = emailDomain(a.email);
    return d && d !== userDomain && d !== emailDomain(e.organizer_email);
  });
  if (external && e.attendees.length > 1) return "meeting";
  return "personal";
}

const CATEGORIES = "travel, health, meeting, personal, family, finance, other";

/**
 * Classify a batch of events in one Haiku call, falling back to the heuristic
 * for any the model doesn't return (or when the AI is unavailable). One call
 * per sync keeps cost bounded even for a busy calendar.
 */
async function classifyEvents(
  events: SyncedCalendarEvent[],
  userDomain: string | null,
): Promise<EventCategory[]> {
  const fallback = events.map((e) => heuristicCategory(e, userDomain));
  const anthropic = getAnthropic();
  if (!anthropic || events.length === 0) return fallback;

  const list = events
    .map((e, i) => `${i}. ${e.title}${e.location ? ` @ ${e.location}` : ""}`)
    .join("\n");
  const prompt = `Classify each calendar event into one category: ${CATEGORIES}.
- travel: flights, hotels, trips, anything at an airport.
- health: doctor, dentist, therapy, medical appointments.
- meeting: work meetings, calls with people outside your household.
- family: birthdays, anniversaries, family gatherings.
- finance: tax, accountant, payment-due, financial reviews.
- personal: personal errands and plans.
- other: anything that fits none of the above.

Events:
${list}

Return ONLY a JSON array of {"i": <index>, "category": "<one category>"} objects, one per event. No prose.`;

  try {
    const msg = await anthropic.messages.create({
      model: getModel(),
      max_tokens: 900,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "[]";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned) as Array<{ i: number; category: string }>;
    const out = [...fallback];
    for (const row of parsed) {
      if (typeof row.i === "number" && row.i >= 0 && row.i < out.length && isCategory(row.category)) {
        out[row.i] = row.category;
      }
    }
    return out;
  } catch {
    return fallback;
  }
}

function isCategory(v: string): v is EventCategory {
  return ["travel", "health", "meeting", "personal", "family", "finance", "other"].includes(v);
}

/** Sync one Google Calendar connection: pull, classify, route, upsert. */
export async function syncCalendarConnection(input: {
  userId: string;
  connectionId: string;
  routingMode: "auto" | "fixed";
  routingTargetOrgIds: string[];
  accountEmail: string;
}): Promise<number> {
  const token = await getFreshCloudAccessToken(input.connectionId);
  if (!token) return 0;
  const events = await calendarSync(token.accessToken, 30, 90);
  return ingestCalendarEvents({ ...input, events });
}

/**
 * Provider-agnostic ingest for a window of calendar events: categorize (heuristic
 * + batched Haiku), route to a section, upsert into calendar_events, mark synced,
 * and audit. Shared by Google Calendar and Outlook Calendar; only the fetch
 * differs. Returns the number of events upserted.
 */
export async function ingestCalendarEvents(input: {
  userId: string;
  connectionId: string;
  routingMode: "auto" | "fixed";
  routingTargetOrgIds: string[];
  accountEmail: string;
  events: SyncedCalendarEvent[];
}): Promise<number> {
  const events = input.events;
  if (events.length === 0) {
    await markCloudConnectionSynced(input.connectionId);
    return 0;
  }

  // Pick the destination org. Fixed -> first chosen target. Auto -> Personal.
  let targetOrgId: string | null = null;
  if (input.routingMode === "fixed" && input.routingTargetOrgIds.length > 0) {
    targetOrgId = input.routingTargetOrgIds[0];
  } else {
    const { personalOrgId } = await resolveWorkspaceOrgs(input.userId);
    targetOrgId = personalOrgId;
  }

  const userDomain = emailDomain(input.accountEmail);
  const categories = await classifyEvents(events, userDomain);

  const admin = createAdminClient();
  const rows = events.map((e, i) => {
    const category = categories[i];
    return {
      user_id: input.userId,
      connection_id: input.connectionId,
      organization_id: targetOrgId,
      section_key: CATEGORY_SECTION[category],
      provider_event_id: e.provider_event_id,
      title: e.title,
      description: e.description,
      location: e.location,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      is_all_day: e.is_all_day,
      organizer_email: e.organizer_email,
      attendees: e.attendees,
      category,
      web_view_link: e.web_view_link,
      synced_at: new Date().toISOString(),
    };
  });

  // Upsert in batches to stay within request limits.
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    await admin
      .from("calendar_events")
      .upsert(rows.slice(i, i + BATCH), { onConflict: "user_id,connection_id,provider_event_id" });
  }

  await markCloudConnectionSynced(input.connectionId);
  await logAuditEvent({
    userId: input.userId,
    action: "cloud.calendar_synced",
    resourceType: "cloud_connection",
    resourceId: input.connectionId,
    metadata: { count: rows.length },
  });
  return rows.length;
}

export type CalendarSyncSummary = { connections: number; events: number };

/** Sync every active Calendar connection across all users (cron entry). */
export async function syncAllCalendars(): Promise<CalendarSyncSummary> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cloud_connections")
    .select("id, user_id, account_email, routing_mode, routing_target_org_ids")
    .eq("provider", "google")
    .eq("service", "calendar")
    .eq("status", "active");

  const conns = (data as Array<{
    id: string;
    user_id: string;
    account_email: string;
    routing_mode: "auto" | "fixed";
    routing_target_org_ids: string[] | null;
  }>) ?? [];

  let events = 0;
  for (const c of conns) {
    try {
      events += await syncCalendarConnection({
        userId: c.user_id,
        connectionId: c.id,
        routingMode: c.routing_mode === "fixed" ? "fixed" : "auto",
        routingTargetOrgIds: c.routing_target_org_ids ?? [],
        accountEmail: c.account_email,
      });
    } catch {
      // One connection failing must not abort the rest.
    }
  }
  return { connections: conns.length, events };
}

/** Sync all of one user's Calendar connections (used on first connect). */
export async function syncUserCalendars(userId: string): Promise<number> {
  const conns = await listCloudConnectionsByService(userId, "calendar");
  let events = 0;
  for (const c of conns) {
    if (c.status !== "active") continue;
    events += await syncCalendarConnection({
      userId,
      connectionId: c.id,
      routingMode: c.routingMode,
      routingTargetOrgIds: c.routingTargetOrgIds,
      accountEmail: c.accountEmail,
    });
  }
  return events;
}

export type UpcomingEvent = {
  id: string;
  title: string;
  location: string | null;
  startsAt: string;
  isAllDay: boolean;
  category: EventCategory | null;
  webViewLink: string | null;
};

/** Events starting within the next `hours` for one org (dashboard strip). */
export async function listUpcomingEvents(
  userId: string,
  organizationId: string,
  hours = 48,
): Promise<UpcomingEvent[]> {
  const admin = createAdminClient();
  const now = new Date();
  const until = new Date(now.getTime() + hours * 3600 * 1000);
  const { data } = await admin
    .from("calendar_events")
    .select("id, title, location, starts_at, is_all_day, category, web_view_link")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .gte("starts_at", now.toISOString())
    .lte("starts_at", until.toISOString())
    .order("starts_at", { ascending: true })
    .limit(8);
  return ((data as Array<{
    id: string;
    title: string;
    location: string | null;
    starts_at: string;
    is_all_day: boolean;
    category: EventCategory | null;
    web_view_link: string | null;
  }>) ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    location: r.location,
    startsAt: r.starts_at,
    isAllDay: r.is_all_day,
    category: r.category,
    webViewLink: r.web_view_link,
  }));
}

/** Upcoming events filed into one section (section-page panel). */
export async function listSectionEvents(
  userId: string,
  organizationId: string,
  sectionKey: string,
  limit = 10,
): Promise<UpcomingEvent[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("calendar_events")
    .select("id, title, location, starts_at, is_all_day, category, web_view_link")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .eq("section_key", sectionKey)
    .gte("starts_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);
  return ((data as Array<{
    id: string;
    title: string;
    location: string | null;
    starts_at: string;
    is_all_day: boolean;
    category: EventCategory | null;
    web_view_link: string | null;
  }>) ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    location: r.location,
    startsAt: r.starts_at,
    isAllDay: r.is_all_day,
    category: r.category,
    webViewLink: r.web_view_link,
  }));
}
