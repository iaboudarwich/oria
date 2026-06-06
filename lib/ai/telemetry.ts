import "server-only";

import { estimatedCostUSD } from "./pricing";
import { recordSystemEvent } from "@/lib/data/system-events";

/**
 * One place to record what every model call cost, how long it took, and
 * whether it failed. Before this, each call site hand-rolled its own
 * recordSystemEvent payload, so the same fact (an extraction call) was
 * logged with slightly different keys than an Ask Oria call, which made
 * the admin health page's roll-ups fragile and left the streaming agents
 * recording nothing at all.
 *
 * The emitted events are still plain `ai.request` / `ai.error` system
 * events, so the existing Admin / System Health aggregations keep working
 * unchanged. The context shape is now fixed:
 *
 *   ai.request → { surface, provider, model, input_tokens, output_tokens,
 *                  cost_usd, latency_ms?, ...extra }
 *   ai.error   → { surface, provider, model?, statusCode?, name?,
 *                  latency_ms?, ...extra }
 *
 * `input_tokens` / `output_tokens` / `cost_usd` (read by system-health
 * roll-ups) and `surface` / `statusCode` / `model` (read by the health
 * page's error list) are deliberately kept exactly as they were.
 *
 * Provider is captured explicitly, today it's always "anthropic", but
 * recording it now means a future move behind a gateway (or a second
 * provider) is a one-argument change, not a schema migration of old
 * telemetry.
 */

/** Where the call originated. Free-form so new surfaces don't need a code change. */
export type AiSurface =
  | "extract"
  | "ask"
  | "work-agent"
  | "work-report"
  | "text-extract"
  | "sort-items"
  | (string & {});

const DEFAULT_PROVIDER = "anthropic";

export type AiCallTelemetry = {
  surface: AiSurface;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Wall-clock latency of the model call in ms, when measured. */
  latencyMs?: number;
  /** Defaults to "anthropic". */
  provider?: string;
  organizationId?: string | null;
  actorId?: string | null;
  /** Surface-specific extras (filename, query preview, …). */
  extra?: Record<string, unknown>;
};

/** Record a successful model call: cost, model, latency, provider, tokens. */
export function recordAiCall(t: AiCallTelemetry): void {
  void recordSystemEvent({
    kind: "ai.request",
    severity: "info",
    message: t.surface,
    context: {
      surface: t.surface,
      provider: t.provider ?? DEFAULT_PROVIDER,
      model: t.model,
      input_tokens: t.inputTokens,
      output_tokens: t.outputTokens,
      cost_usd: estimatedCostUSD(t.model, t.inputTokens, t.outputTokens),
      ...(t.latencyMs != null ? { latency_ms: Math.round(t.latencyMs) } : {}),
      ...(t.extra ?? {}),
    },
    organizationId: t.organizationId ?? null,
    actorId: t.actorId ?? null,
  });
}

export type AiErrorTelemetry = {
  surface: AiSurface;
  /** Best-known model id; may be unknown if the call threw before dispatch. */
  model?: string;
  provider?: string;
  latencyMs?: number;
  /** The thrown value. Status/name are pulled off it when present. */
  error: unknown;
  organizationId?: string | null;
  actorId?: string | null;
  extra?: Record<string, unknown>;
};

/** Record a failed model call. Mirrors recordAiCall's context keys. */
export function recordAiError(t: AiErrorTelemetry): void {
  const err = t.error as { status?: number; message?: string; name?: string } | undefined;
  void recordSystemEvent({
    kind: "ai.error",
    severity: "error",
    message: err?.message ?? "AI call failed",
    context: {
      surface: t.surface,
      provider: t.provider ?? DEFAULT_PROVIDER,
      ...(t.model ? { model: t.model } : {}),
      // camelCase to match the admin health page's error list renderer.
      ...(typeof err?.status === "number" ? { statusCode: err.status } : {}),
      ...(err?.name ? { name: err.name } : {}),
      ...(t.latencyMs != null ? { latency_ms: Math.round(t.latencyMs) } : {}),
      ...(t.extra ?? {}),
    },
    organizationId: t.organizationId ?? null,
    actorId: t.actorId ?? null,
  });
}
