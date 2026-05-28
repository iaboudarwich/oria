// Sentry server-side initialisation (Node.js runtime).
// Loaded automatically by Next.js via instrumentation.ts.
// Keep in sync with sentry.client.config.ts and sentry.edge.config.ts.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring off for beta.
  tracesSampleRate: 0,

  // Never attach PII that Sentry collects by default.
  sendDefaultPii: false,

  environment: process.env.VERCEL_ENV ?? "development",

  // ── Privacy filter ───────────────────────────────────────────────────────
  beforeSend(event) {
    // Drop request bodies — server requests carry uploaded file bytes or
    // the full AI query + history payload.
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      // Strip query strings: signed-URL tokens and Supabase keys live there.
      if (event.request.url) {
        event.request.url = event.request.url.split("?")[0];
      }
    }

    // Scrub large extra strings that might contain document content.
    if (event.extra) {
      for (const key of Object.keys(event.extra)) {
        const val = event.extra[key];
        if (typeof val === "string" && val.length > 500) {
          event.extra[key] = "[redacted: long string]";
        }
      }
    }

    // Never send user identity to Sentry from the server either.
    delete event.user;

    return event;
  },

  // ── Breadcrumb filter ────────────────────────────────────────────────────
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === "console") return null;
    if (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") {
      if (breadcrumb.data) {
        delete breadcrumb.data.request_body_size;
        delete breadcrumb.data.response_body_size;
        if (typeof breadcrumb.data.url === "string") {
          breadcrumb.data.url = breadcrumb.data.url.split("?")[0];
        }
      }
    }
    return breadcrumb;
  },

  includeLocalVariables: false,
});
