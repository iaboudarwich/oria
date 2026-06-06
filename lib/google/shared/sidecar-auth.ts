import "server-only";

import { createHmac } from "node:crypto";

/**
 * Build the HMAC auth headers every Python-sidecar request carries:
 *   X-Oria-Timestamp: <unix seconds>
 *   X-Oria-Signature: sha256=HMAC-SHA256(ORIA_SIDECAR_SECRET, "<ts>:<METHOD>:<path>")
 *
 * Returns {} when ORIA_SIDECAR_SECRET is unset (local dev without a secret),
 * so callers work unchanged in un-secured dev environments. The sidecar
 * rejects a missing/wrong signature or a timestamp older than 60s.
 *
 * Single source of truth shared by the extraction client, the Gmail scan
 * client, and the Google cloud (Drive/Calendar) client.
 */
export function sidecarAuthHeaders(method: "POST" | "GET", path: string): Record<string, string> {
  const secret = process.env.ORIA_SIDECAR_SECRET;
  if (!secret) return {};
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac("sha256", secret).update(`${ts}:${method}:${path}`).digest("hex");
  return { "X-Oria-Timestamp": ts, "X-Oria-Signature": `sha256=${sig}` };
}
