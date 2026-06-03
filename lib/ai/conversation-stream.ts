import "server-only";

import { buildAdapter, oriaDefaultAdapter } from "@/lib/ai-providers";
import type { Message, CompletionOptions } from "@/lib/ai-providers";
import { mapErrorToStatus, mapErrorKind, errorStatus, errorMessage } from "@/lib/ai-providers/errors";
import {
  getActiveAiConnectionKey,
  setAiConnectionStatus,
  setPendingAiNotice,
} from "@/lib/data/ai-connections";

/**
 * Stream a conversation completion through the user's connected provider when
 * active, else Oria's default. If the user's provider fails BEFORE any output
 * (key went invalid / rate limited / out of credits), it silently falls back to
 * Oria for this query, records the new status, and queues a one-time notice for
 * the next page load. A failure after partial output is re-thrown (we cannot
 * cleanly recover mid-stream).
 */
export async function* streamConversation(input: {
  userId: string;
  messages: Message[];
  options: CompletionOptions;
}): AsyncGenerator<string, void, unknown> {
  const conn = await getActiveAiConnectionKey(input.userId);
  if (conn && conn.status === "active") {
    const userAdapter = buildAdapter(conn.provider, conn.apiKey);
    let emitted = false;
    try {
      for await (const delta of userAdapter.streamComplete(input.messages, input.options)) {
        emitted = true;
        yield delta;
      }
      return;
    } catch (e) {
      if (emitted) throw e;
      // A too-long context is the prompt's problem, not the provider's, so
      // surface it instead of silently retrying on Oria with the same input.
      if (mapErrorKind(errorStatus(e), errorMessage(e)) === "context_too_long") throw e;
      const status = mapErrorToStatus(errorStatus(e), errorMessage(e));
      await setAiConnectionStatus(input.userId, status, errorMessage(e).slice(0, 200));
      await setPendingAiNotice(input.userId, {
        provider: conn.provider,
        status,
        at: new Date().toISOString(),
      });
      // fall through to Oria's default below
    }
  }

  const oria = oriaDefaultAdapter();
  if (!oria) throw new Error("anthropic_not_configured");
  yield* oria.streamComplete(input.messages, input.options);
}
