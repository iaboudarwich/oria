import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export type UserPreferences = {
  responseLength: "short" | "medium" | "long";
  formality: "casual" | "professional";
  focusAreas: string[];
  pinnedMetrics: string[];
};

export type DerivedSignals = {
  /** Most-visited sections in the last 30 days, most first. */
  topSections: Array<{ key: string; count: number }>;
  /** Average length (chars) of questions asked. Null if none. */
  avgQueryLength: number | null;
  /** When the user is most active. Null if not enough data. */
  preferredTime: "morning" | "afternoon" | "evening" | "night" | null;
  /** Fraction of reminders dismissed vs acted on (0..1). Null if none. */
  reminderDismissalRate: number | null;
  totalSignals: number;
};

export type UserProfile = {
  preferences: UserPreferences;
  derived: DerivedSignals;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  responseLength: "medium",
  formality: "casual",
  focusAreas: [],
  pinnedMetrics: [],
};

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function timeBucket(hour: number): DerivedSignals["preferredTime"] {
  if (hour >= 5 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 16) return "afternoon";
  if (hour >= 17 && hour <= 21) return "evening";
  return "night";
}

type SignalRow = {
  signal_type: string;
  signal_value: Record<string, unknown>;
  created_at: string;
};

/**
 * The user's profile: explicit preferences plus signals derived from the last
 * 30 days of behavior. Cached per request. Always returns a value (defaults
 * when nothing is stored yet).
 */
export const getUserProfile = cache(async (userId: string): Promise<UserProfile> => {
  const admin = createAdminClient();

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [prefRes, sigRes] = await Promise.all([
    admin.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
    admin
      .from("behavior_signals")
      .select("signal_type, signal_value, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const prefRow = prefRes.data as Record<string, unknown> | null;
  const preferences: UserPreferences = prefRow
    ? {
        responseLength: (prefRow.response_length as UserPreferences["responseLength"]) ?? "medium",
        formality: (prefRow.formality as UserPreferences["formality"]) ?? "casual",
        focusAreas: asStringArray(prefRow.focus_areas),
        pinnedMetrics: asStringArray(prefRow.pinned_metrics),
      }
    : { ...DEFAULT_PREFERENCES };

  const signals = (sigRes.data ?? []) as SignalRow[];

  const sectionCounts = new Map<string, number>();
  let queryLenSum = 0;
  let queryCount = 0;
  const hourBuckets = new Map<string, number>();
  let dismissed = 0;
  let acted = 0;

  for (const s of signals) {
    if (s.signal_type === "section_visited") {
      const key = String(s.signal_value.section_key ?? "");
      if (key) sectionCounts.set(key, (sectionCounts.get(key) ?? 0) + 1);
    } else if (s.signal_type === "query_asked") {
      const len = Number(s.signal_value.length);
      if (Number.isFinite(len)) {
        queryLenSum += len;
        queryCount += 1;
      }
    } else if (s.signal_type === "reminder_dismissed") {
      dismissed += 1;
    } else if (s.signal_type === "reminder_acted_on") {
      acted += 1;
    }
    const bucket = timeBucket(new Date(s.created_at).getHours());
    if (bucket) hourBuckets.set(bucket, (hourBuckets.get(bucket) ?? 0) + 1);
  }

  const topSections = [...sectionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, count]) => ({ key, count }));

  let preferredTime: DerivedSignals["preferredTime"] = null;
  let max = 0;
  for (const [bucket, n] of hourBuckets) {
    if (n > max) {
      max = n;
      preferredTime = bucket as DerivedSignals["preferredTime"];
    }
  }

  return {
    preferences,
    derived: {
      topSections,
      avgQueryLength: queryCount > 0 ? Math.round(queryLenSum / queryCount) : null,
      preferredTime: signals.length > 0 ? preferredTime : null,
      reminderDismissalRate:
        dismissed + acted > 0 ? dismissed / (dismissed + acted) : null,
      totalSignals: signals.length,
    },
  };
});
