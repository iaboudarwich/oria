import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Append-only behavioural signal log. Cheap, never blocks the caller.
 *
 * The whole point of this file is that **calling it should never break a
 * user-facing flow** — we wrap the insert and swallow any error. Telemetry
 * dropping is fine; the user's action is what matters.
 *
 * Common kinds:
 *   • "upload.moved"     — user manually moved an upload between sections
 *   • "reminder.kept"    — user confirmed a suggested reminder
 *   • "reminder.dismissed" — user deleted a suggested reminder
 *   • "search.queried"   — user issued a search query
 *   • "search.clicked"   — user clicked a result
 *
 * Payload is free-form. Keep keys short and consistent so future training
 * jobs can JSON-path into them cleanly.
 */
export type LearningKind =
  | "upload.moved"
  | "reminder.kept"
  | "reminder.dismissed"
  | "search.queried"
  | "search.clicked";

export async function recordLearningEvent(input: {
  organizationId: string;
  actorId: string | null;
  kind: LearningKind;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("learning_events").insert({
      organization_id: input.organizationId,
      actor_id: input.actorId,
      kind: input.kind,
      payload: input.payload,
    });
  } catch {
    // Telemetry is best-effort.
  }
}
