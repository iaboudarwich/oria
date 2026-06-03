import type { ConnectionStatus, ErrorKind } from "./types";

/**
 * Map a provider error (HTTP status + message) to a connection status, shared by
 * all three adapters' validateKey() and runtime fallback handling.
 *   401/403 -> invalid; 429 -> rate_limited; quota/credit/billing -> out_of_credits.
 */
export function mapErrorToStatus(status: number | undefined, message: string | undefined): ConnectionStatus {
  const msg = (message ?? "").toLowerCase();
  if (status === 402 || /quota|credit|billing|insufficient_quota|insufficient funds|balance/.test(msg)) {
    return "out_of_credits";
  }
  if (status === 429 || /rate.?limit|too many requests|overloaded/.test(msg)) {
    return "rate_limited";
  }
  if (status === 401 || status === 403 || /invalid|unauthorized|api key|permission/.test(msg)) {
    return "invalid";
  }
  return "invalid";
}

/**
 * Richer runtime classification used to decide fallback behavior and surfacing.
 * context_too_long is NOT a provider-availability problem, so the caller should
 * surface it rather than silently retry on another provider.
 */
export function mapErrorKind(status: number | undefined, message: string | undefined): ErrorKind {
  const msg = (message ?? "").toLowerCase();
  if (/context.?length|context window|maximum context|too many tokens|reduce the length/.test(msg)) {
    return "context_too_long";
  }
  if (status === 402 || /quota|credit|billing|insufficient_quota|insufficient funds|balance/.test(msg)) {
    return "out_of_credits";
  }
  if (status === 429 || /rate.?limit|too many requests|overloaded/.test(msg)) {
    return "rate_limited";
  }
  if (status === 401 || status === 403 || /invalid|unauthorized|api key|permission/.test(msg)) {
    return "invalid_key";
  }
  if ((status != null && status >= 500) || /unavailable|server error|timeout|timed out/.test(msg)) {
    return "provider_unavailable";
  }
  return "unknown";
}

/** Parse a Retry-After header value (seconds) off an error, if present. */
export function retryAfterSeconds(err: unknown): number | null {
  if (err && typeof err === "object") {
    const e = err as { headers?: Record<string, string> | Headers };
    const h = e.headers;
    const raw =
      h instanceof Headers ? h.get("retry-after") : (h as Record<string, string> | undefined)?.["retry-after"];
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Pull a numeric HTTP status off an unknown thrown error, if present. */
export function errorStatus(err: unknown): number | undefined {
  if (err && typeof err === "object") {
    const e = err as { status?: number; statusCode?: number; response?: { status?: number } };
    return e.status ?? e.statusCode ?? e.response?.status;
  }
  return undefined;
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message?: unknown }).message ?? "");
  }
  return String(err ?? "");
}
