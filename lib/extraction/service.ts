/**
 * HTTP client for the Python extraction sidecar.
 *
 * Base URL: PYTHON_EXTRACTION_URL env var (default: http://localhost:8000)
 * The sidecar is optional — callers check `isServiceAvailable()` and fall
 * back to the npm-based extractors when the service is unreachable.
 *
 * Auth: every request to /extract, /embed, /embed-query carries two headers:
 *   X-Oria-Timestamp  — Unix seconds (integer)
 *   X-Oria-Signature  — sha256=HMAC-SHA256(ORIA_SIDECAR_SECRET, "<ts>:<METHOD>:<path>")
 * The sidecar rejects requests with a missing/wrong signature or a timestamp
 * older than 60 s.  /health is intentionally unprotected.
 */

import { createHmac } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import type { ExtractionServiceResult } from "./types";

const BASE_URL =
  process.env.PYTHON_EXTRACTION_URL?.replace(/\/$/, "") ??
  "http://localhost:8000";

const TIMEOUT_MS = 60_000; // 60 s — Docling on large docs can be slow

// ── HMAC signing ─────────────────────────────────────────────────────────────

/**
 * Build the X-Oria-Timestamp and X-Oria-Signature headers for a sidecar request.
 * When ORIA_SIDECAR_SECRET is absent (local dev without secret), returns an
 * empty object so callers work unchanged in un-secured dev environments.
 */
function sidecarAuthHeaders(
  method: "POST",
  path: string
): Record<string, string> {
  const secret = process.env.ORIA_SIDECAR_SECRET;
  if (!secret) return {};

  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = `${ts}:${method}:${path}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");

  return {
    "X-Oria-Timestamp": ts,
    "X-Oria-Signature": `sha256=${sig}`,
  };
}

/** True when the Python service responded to /health in the last probe. */
let _available: boolean | null = null;
let _lastProbe = 0;
const PROBE_TTL_MS = 30_000;

export async function isServiceAvailable(): Promise<boolean> {
  const now = Date.now();
  if (_available !== null && now - _lastProbe < PROBE_TTL_MS) {
    return _available;
  }
  try {
    const res = await fetch(`${BASE_URL}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    _available = res.ok;
  } catch {
    _available = false;
  }
  _lastProbe = now;
  return _available;
}

/**
 * Send a file buffer to the Python service for extraction.
 * Returns null if the service is unavailable or returns an error.
 */
export async function extractViaService(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ExtractionServiceResult | null> {
  const available = await isServiceAvailable();
  if (!available) return null;

  try {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    form.append("file", blob, filename);
    form.append("mime_type", mimeType);
    form.append("filename", filename);

    const res = await fetch(`${BASE_URL}/extract`, {
      method: "POST",
      headers: sidecarAuthHeaders("POST", "/extract"),
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(
        `[extraction/service] HTTP ${res.status} from /extract for ${filename}`
      );
      return null;
    }

    const json = (await res.json()) as {
      text: string;
      method: string;
      file_hash: string;
      char_count: number;
    };

    return {
      text: json.text ?? "",
      method: (json.method ?? "failed") as ExtractionServiceResult["method"],
      fileHash: json.file_hash ?? "",
      charCount: json.char_count ?? 0,
    };
  } catch (err) {
    // Capture unexpected failures (e.g. malformed response, non-abort errors).
    // Routine AbortErrors (cold-start timeouts) are expected and not worth paging on.
    if (!(err instanceof Error && err.name === "AbortError")) {
      Sentry.captureException(err, {
        tags: { surface: "sidecar" },
        extra: { filename },
      });
    }
    console.warn("[extraction/service] extract request failed:", err);
    _available = false; // assume down until next probe
    return null;
  }
}

/**
 * Embed a list of text strings via the Python service.
 * Returns null on failure.
 */
export async function embedViaService(
  texts: string[]
): Promise<number[][] | null> {
  const available = await isServiceAvailable();
  if (!available || texts.length === 0) return null;

  try {
    const res = await fetch(`${BASE_URL}/embed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...sidecarAuthHeaders("POST", "/embed"),
      },
      body: JSON.stringify({ texts }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) return null;

    const json = (await res.json()) as { embeddings: number[][] };
    return json.embeddings ?? null;
  } catch (err) {
    console.warn("[extraction/service] embed request failed:", err);
    return null;
  }
}

/**
 * Embed a single query string for semantic search.
 * Returns null on failure.
 */
export async function embedQueryViaService(
  query: string
): Promise<number[] | null> {
  const available = await isServiceAvailable();
  if (!available) return null;

  try {
    const res = await fetch(`${BASE_URL}/embed-query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...sidecarAuthHeaders("POST", "/embed-query"),
      },
      body: JSON.stringify({ text: query }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;

    const json = (await res.json()) as { embedding: number[] };
    return json.embedding ?? null;
  } catch (err) {
    console.warn("[extraction/service] embed-query request failed:", err);
    return null;
  }
}
