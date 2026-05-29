import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { distinctiveTokens } from "./section-context";

/**
 * Watches the user's manual moves and, when a clear pattern emerges,
 * materializes a section_memories row tagged source="pattern" so:
 *
 *   1. The user sees it in the section's memory panel and can confirm,
 *      edit, or remove it.
 *   2. Ask Oria / Work AI weave the same memory into their system
 *      prompt the next time the section is scoped.
 *
 * Cheap heuristic. no ML. We look at the last 90 days of
 * `upload.moved` events ending at the same destination. If any
 * distinctive token from the just-moved upload also appears in at
 * least N-1 of the prior 5 moves to the same destination, that's a
 * pattern worth surfacing.
 *
 * Per-org. Never crosses spaces. Idempotent: the same memory content
 * already exists (unique constraint on `content` per scope per org)
 * → silently skipped.
 */

const REPEAT_THRESHOLD = 2; // 2 prior matching moves + the current one = 3
const LOOKBACK_DAYS = 90;
const PRIOR_MOVES_WINDOW = 8;

type Destination =
  | { kind: "builtin"; section: string }
  | { kind: "custom"; customSectionId: string };

type MovedEventRow = {
  payload: {
    upload_id?: string;
    to?: {
      section?: string | null;
      custom_section_id?: string | null;
    };
  };
};

export async function maybeWritePatternMemoryFromMove(input: {
  organizationId: string;
  destination: Destination;
  /** Filename / title / merchant text from the upload that was just moved. */
  sourceText: string;
  destinationLabel: string;
}): Promise<void> {
  try {
    const tokens = distinctiveTokens(input.sourceText);
    if (tokens.length === 0) return;

    const admin = createAdminClient();

    const sinceISO = new Date(
      Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000,
    ).toISOString();

    // Recent moves to the same destination, in this org only.
    const { data, error } = await admin
      .from("learning_events")
      .select("payload")
      .eq("organization_id", input.organizationId)
      .eq("kind", "upload.moved")
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: false })
      .limit(PRIOR_MOVES_WINDOW);
    if (error || !data) return;

    const matching = (data as MovedEventRow[]).filter((row) => {
      const to = row.payload?.to;
      if (!to) return false;
      if (input.destination.kind === "builtin") {
        return (
          to.section === input.destination.section && !to.custom_section_id
        );
      }
      return to.custom_section_id === input.destination.customSectionId;
    });
    if (matching.length < REPEAT_THRESHOLD) return;

    // Pull the actual upload rows so we can re-derive tokens for the
    // prior moves and check token overlap. Avoids fragile assumptions
    // about what's in the payload.
    const priorIds = matching
      .map((m) => m.payload?.upload_id)
      .filter((id): id is string => typeof id === "string");
    if (priorIds.length === 0) return;
    const { data: uploadRows } = await admin
      .from("uploads")
      .select("id, title, filename, merchant")
      .in("id", priorIds);

    const priorTokenSets: Set<string>[] = ((uploadRows ?? []) as Array<{
      title: string | null;
      filename: string;
      merchant?: string | null;
    }>).map((u) =>
      new Set(
        distinctiveTokens(
          `${u.title ?? ""} ${u.filename} ${u.merchant ?? ""}`,
        ),
      ),
    );

    // The distinctive token shared across at least REPEAT_THRESHOLD prior
    // moves AND the current one is the pattern key.
    let strongest: { token: string; count: number } | null = null;
    for (const token of tokens) {
      let count = 0;
      for (const s of priorTokenSets) if (s.has(token)) count += 1;
      if (count >= REPEAT_THRESHOLD) {
        if (!strongest || count > strongest.count) {
          strongest = { token, count };
        }
      }
    }
    if (!strongest) return;

    const content = `When an upload mentions "${strongest.token}", file it in ${input.destinationLabel}.`;

    // Idempotent insert: section_memories has a unique index on
    // (organization_id, builtin_section/custom_section_id, content).
    // Soft-deleted duplicates are skipped here too. if the user
    // deleted this pattern once, we don't re-add it.
    const { data: existing } = await admin
      .from("section_memories")
      .select("id, deleted_at")
      .eq("organization_id", input.organizationId)
      .eq("content", content)
      .limit(1)
      .maybeSingle();
    if (existing) return;

    await admin.from("section_memories").insert({
      organization_id: input.organizationId,
      builtin_section:
        input.destination.kind === "builtin"
          ? input.destination.section
          : null,
      custom_section_id:
        input.destination.kind === "custom"
          ? input.destination.customSectionId
          : null,
      smart_section: null,
      content,
      source: "pattern",
      created_by: null,
    });
  } catch {
    // Best-effort. Never block the move.
  }
}
