import {
  formatEventMessage,
  listUserVisibleEvents,
  type SystemEvent,
} from "@/lib/data/system-events";
import {
  getCurrentContext,
  listUserSpaces,
} from "@/lib/data/organizations";
import {
  readAndClearStatusFlash,
  readLastStatusSeenId,
} from "@/lib/data/status-strip";
import { dismissStatusStrip } from "@/lib/data/status-strip-actions";

/**
 * Small calm strip that sits inside the topbar. Shows the single most
 * recent user-visible event (report ready, upload processed, invite
 * accepted, an upload that failed, etc). One row, dismissible.
 *
 * No bell, no inbox, no list. The strip is intentionally one-thing-at-
 * a-time so it never becomes its own task. Older events live in
 * /dashboard/admin/health for the operator; users only see the latest.
 *
 * Dismissal is persisted via a cookie of the last-seen event id — the
 * strip stays hidden until something newer arrives.
 */
export async function StatusStrip() {
  const [ctx, spaces, lastSeen, flash] = await Promise.all([
    getCurrentContext(),
    listUserSpaces(),
    readLastStatusSeenId(),
    readAndClearStatusFlash(),
  ]);
  if (!ctx) return null;

  // Flash messages win when present: they're a one-shot self-facing
  // confirmation ("You joined Family Circle") that the database doesn't
  // model. readAndClearStatusFlash clears the cookie so it never shows
  // twice. After this render, normal event-based strips resume.
  if (flash) {
    return <StatusStripFlashRow message={flash} />;
  }

  const orgIds = spaces.map((s) => s.organization.id);
  const events = await listUserVisibleEvents({
    organizationIds: orgIds,
    limit: 1,
  });
  const latest = events[0];
  if (!latest) return null;
  if (latest.id === lastSeen) return null;

  return <StatusStripRow event={latest} />;
}

function StatusStripFlashRow({ message }: { message: string }) {
  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg border border-sage/30 bg-sage/[0.07] px-3 py-1.5 text-[12px] text-[#3f5240]">
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-sage"
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">{message}</span>
    </div>
  );
}

function StatusStripRow({ event }: { event: SystemEvent }) {
  const tone =
    event.severity === "error"
      ? "border-claret/30 bg-claret/[0.06] text-claret"
      : "border-line bg-canvas/70 text-ink-muted";
  const message = formatEventMessage(event);
  return (
    <div
      className={`mt-3 flex items-center gap-3 rounded-lg border px-3 py-1.5 text-[12px] ${tone}`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
          event.severity === "error" ? "bg-claret" : "bg-sage"
        }`}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">{message}</span>
      <form action={dismissStatusStrip}>
        <input type="hidden" name="id" value={event.id} />
        <button
          type="submit"
          aria-label="Dismiss"
          className="cursor-pointer text-[12.5px] text-ink-faint hover:text-ink transition-base"
        >
          Dismiss
        </button>
      </form>
    </div>
  );
}
