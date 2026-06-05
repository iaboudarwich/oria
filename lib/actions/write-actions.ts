/**
 * Write-back framework: the small set of Oria-owned, reversible actions, and the
 * pure rules that keep them safe (Round 21). Nothing here mutates; the runner
 * (lib/data/write-action-runner.ts) executes through these definitions behind
 * the rails: propose -> explicit confirm -> execute -> a ~60s undo window ->
 * commit. Every action is on the user's OWN data and fully reversible.
 *
 * v1 deliberately excludes external providers (no Google/Outlook write-back),
 * no sends, no deletes of external data. An "internal event" is a reminder
 * (Oria's native, reversible, calendar-surfaced scheduled item).
 */

export type WriteActionType =
  | "reminder.create"
  | "reminder.complete"
  | "reminder.delete"
  | "reminder.edit"
  | "trackable.status";

export const WRITE_ACTION_TYPES: WriteActionType[] = [
  "reminder.create",
  "reminder.complete",
  "reminder.delete",
  "reminder.edit",
  "trackable.status",
];

export type ProposedAction =
  | { type: "reminder.create"; title: string; date: string | null; time: string | null }
  | { type: "reminder.complete"; reminderId: string; title?: string }
  | { type: "reminder.delete"; reminderId: string; title?: string }
  | {
      type: "reminder.edit";
      reminderId: string;
      title?: string;
      date?: string | null;
      time?: string | null;
    }
  | { type: "trackable.status"; trackableId: string; status: "done" | "wont_do"; title?: string };

/**
 * Whether a proposal is too incomplete to confirm. Returns a clarify reason
 * (the UI/voice asks the user) or null when it is complete. This is the
 * "never guess-and-execute" gate: a reminder with no explicit time is NOT
 * confirmable (no silent default), it asks. Pure + tested.
 */
export function actionNeedsClarification(p: ProposedAction): string | null {
  switch (p.type) {
    case "reminder.create":
      if (!p.title || !p.title.trim()) return "missing_title";
      if (!p.date || !p.time) return "missing_when";
      return null;
    case "reminder.complete":
    case "reminder.delete":
      return p.reminderId ? null : "missing_target";
    case "reminder.edit":
      if (!p.reminderId) return "missing_target";
      if (!p.title && !p.date && !p.time) return "nothing_to_change";
      return null;
    case "trackable.status":
      if (!p.trackableId) return "missing_target";
      if (p.status !== "done" && p.status !== "wont_do") return "missing_status";
      return null;
  }
}

/** The reverse operation undo performs, for clarity + tests. */
export function inverseOf(type: WriteActionType): string {
  switch (type) {
    case "reminder.create":
      return "delete_created";
    case "reminder.delete":
      return "restore_deleted";
    case "reminder.complete":
      return "restore_prior_done";
    case "reminder.edit":
      return "restore_prior_fields";
    case "trackable.status":
      return "restore_prior_status";
  }
}

export function isWriteActionType(v: unknown): v is WriteActionType {
  return typeof v === "string" && (WRITE_ACTION_TYPES as string[]).includes(v);
}
