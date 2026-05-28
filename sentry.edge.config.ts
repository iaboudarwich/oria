// Sentry edge-runtime initialisation.
// Loaded automatically by Next.js via instrumentation.ts for edge routes
// and middleware. Mirrors the server config — edge has no fs/crypto, so
// some options aren't available but the privacy surface is the same.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0,
  sendDefaultPii: false,

  environment: process.env.VERCEL_ENV ?? "development",

  beforeSend(event) {
    if (event.request) {
      delete event.request.data;
      delete event.request.cookies;
      if (event.request.url) {
        event.request.url = event.request.url.split("?")[0];
      }
    }
    if (event.extra) {
      for (const key of Object.keys(event.extra)) {
        const val = event.extra[key];
        if (typeof val === "string" && val.length > 500) {
          event.extra[key] = "[redacted: long string]";
        }
      }
    }
    delete event.user;
    return event;
  },

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
