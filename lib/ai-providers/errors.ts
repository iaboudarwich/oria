import type { ConnectionStatus } from "./types";

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
