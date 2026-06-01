// A tiny client-side ring buffer of recent user actions.
//
// Two consumers:
//   1. Sentry  — every recorded action is also pushed as a breadcrumb so
//      error reports arrive with the last several things the user did.
//   2. The "Report a problem" dialog — reads the most recent action to
//      auto-include in the report context.
//
// Kept deliberately small (last 10) and string-only so nothing sensitive
// (document text, query content) ever lands here. Callers pass short,
// non-PII labels like "Navigated to /dashboard/calendar".

import * as Sentry from "@sentry/nextjs";

export type RecentAction = { at: number; action: string };

const MAX = 10;
const buffer: RecentAction[] = [];

export function recordAction(action: string): void {
  buffer.push({ at: Date.now(), action });
  if (buffer.length > MAX) buffer.shift();

  // Mirror into Sentry so captured errors carry the same trail.
  Sentry.addBreadcrumb({
    category: "navigation.action",
    message: action,
    level: "info",
  });
}

export function getRecentActions(): RecentAction[] {
  return [...buffer];
}

export function getLastAction(): string | null {
  return buffer.length ? buffer[buffer.length - 1].action : null;
}
