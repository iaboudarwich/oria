import "server-only";

import { sidecarAuthHeaders } from "@/lib/google/shared/sidecar-auth";

// Shared Next.js -> Python sidecar POST helper for the cloud clients (Google
// Drive/Calendar, Microsoft OneDrive/Outlook Calendar). Signs the request,
// times out, and returns null on any non-2xx or transport error. Tokens travel
// only in the body and are never logged (only the path + error name).

const SIDECAR_URL =
  process.env.PYTHON_EXTRACTION_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export async function postSidecar<T>(
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<T | null> {
  try {
    const res = await fetch(`${SIDECAR_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sidecarAuthHeaders("POST", path) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn(`[cloud/sidecar] ${path} HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[cloud/sidecar] ${path} failed:`, (err as Error).name);
    return null;
  }
}
