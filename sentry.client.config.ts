// Sentry client-side initialisation.
// Loaded automatically by Next.js when the SDK is installed.
// Keep in sync with sentry.server.config.ts and sentry.edge.config.ts.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring off for beta — no traces quota consumed.
  tracesSampleRate: 0,

  // Session replay completely disabled — it captures DOM content / keystrokes
  // and would expose user documents and AI queries.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Never attach PII that Sentry collects by default (IP, user-agent, email).
  sendDefaultPii: false,

  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",

  // ── Privacy filter: runs before every event is sent ─────────────────────
  beforeSend(event) {
    // Drop request bodies entirely — would contain uploaded doc bytes / AI queries.
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      // Strip query strings from URLs: signed-URL tokens live there.
      if (event.request.url) {
        event.request.url = event.request.url.split("?")[0];
      }
    }

    // Scrub any extra context string longer than 500 chars — could be
    // extracted document text that leaked into an error's context.
    if (event.extra) {
      for (const key of Object.keys(event.extra)) {
        const val = event.extra[key];
        if (typeof val === "string" && val.length > 500) {
          event.extra[key] = "[redacted: long string]";
        }
      }
    }

    // Drop the user object — we never want emails or IPs in Sentry.
    delete event.user;

    return event;
  },

  // ── Breadcrumb filter ────────────────────────────────────────────────────
  beforeBreadcrumb(breadcrumb) {
    // console.* breadcrumbs can contain logged arguments including doc text.
    if (breadcrumb.category === "console") return null;
    // XHR/fetch breadcrumbs expose request/response body sizes and URLs
    // containing signed tokens. Strip the size fields; the category itself
    // (so we know a network call happened) is fine to keep.
    if (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") {
      if (breadcrumb.data) {
        delete breadcrumb.data.request_body_size;
        delete breadcrumb.data.response_body_size;
        // Also scrub URL query strings from breadcrumb data.
        if (typeof breadcrumb.data.url === "string") {
          breadcrumb.data.url = breadcrumb.data.url.split("?")[0];
        }
      }
    }
    return breadcrumb;
  },

  // Local variable capture is off — stack frames could include local
  // variables holding document content or query text.
  includeLocalVariables: false,
});
