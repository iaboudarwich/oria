import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { enforceActiveOrg } from "./scope";
import type { Profile, TimelineEvent } from "@/lib/supabase/types";

export type TimelineEventWithActor = TimelineEvent & {
  actor: Pick<Profile, "id" | "full_name" | "email"> | null;
};

export async function listTimeline(
  limit = 100,
): Promise<TimelineEventWithActor[]> {
  const ctx = await requireContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("timeline_events")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  const events = enforceActiveOrg(
    data as TimelineEvent[],
    ctx.organization.id,
    "listTimeline",
  );
  const actorIds = Array.from(
    new Set(events.map((e) => e.actor_id).filter((id): id is string => !!id)),
  );

  const profileMap = new Map<
    string,
    Pick<Profile, "id" | "full_name" | "email">
  >();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", actorIds);
    (profiles ?? []).forEach((p) => {
      const row = p as Pick<Profile, "id" | "full_name" | "email">;
      profileMap.set(row.id, row);
    });
  }

  return events.map((e) => ({
    ...e,
    actor: e.actor_id ? profileMap.get(e.actor_id) ?? null : null,
  }));
}

export type TimelineGroup = {
  label: string;
  iso: string;
  entries: TimelineEventWithActor[];
};

export function groupByDay(events: TimelineEventWithActor[]): TimelineGroup[] {
  const groups = new Map<string, TimelineGroup>();
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });

  events.forEach((e) => {
    const d = new Date(e.created_at);
    const key = d.toISOString().slice(0, 10);
    if (!groups.has(key)) {
      groups.set(key, { label: relativeDay(d), iso: fmt(d), entries: [] });
    }
    groups.get(key)!.entries.push(e);
  });

  return Array.from(groups.values());
}

function relativeDay(d: Date): string {
  const today = new Date();
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (startOf(today) - startOf(d)) / (1000 * 60 * 60 * 24);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

export function displayActor(
  actor: { full_name: string | null; email: string } | null,
): string {
  if (!actor) return "Oria";
  return actor.full_name?.trim() || actor.email.split("@")[0];
}
