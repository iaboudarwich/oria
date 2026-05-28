// Next.js instrumentation hook — loaded once per runtime before the app starts.
// Routes Sentry initialisation to the correct config based on which runtime
// is active (Node.js server vs Edge).
//
// See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Forward server-side request errors to Sentry.
// captureRequestError is Sentry's typed wrapper for Next.js's onRequestError hook.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
