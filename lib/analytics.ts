import { track } from "@vercel/analytics";

/**
 * Typed analytics wrapper around Vercel Analytics.
 * No-ops in development so local testing stays clean.
 * Zero PII in props — only structural event metadata.
 */
export function trackEvent(event: string, props?: Record<string, string | number | boolean>): void {
  if (process.env.NODE_ENV !== "production") return;
  track(event, props);
}
