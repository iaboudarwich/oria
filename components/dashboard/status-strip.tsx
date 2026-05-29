import {
  formatEventMessage,
  listUserVisibleEvents,
  type SystemEvent,
} from "@/lib/data/system-events";
import { getCurrentContext } from "@/lib/data/organizations";
import {
  readLastStatusSeenId,
  readStatusFlash,
} from "@/lib/data/status-strip";
import { dismissStatusStrip } from "@/lib/data/status-strip-actions";

/**
 * Small calm strip that sits inside the topbar. Shows the single most
 * recent user-visible event from the ACTIVE space (report ready, upload
 * processed, invite accepted, an upload that failed). One row,
 * dismissible.
 *
 * SCOPE: strictly active org only. The previous version called
 * listUserSpaces() and queried events across every space the user
 * belonged to. that meant a workspace user got a Personal-space
 * "Upload processed" event in their topbar. Messages were generic so
 * no content leaked, but a notification surfacing in the wrong context
 * is itself a UX/privacy issue. Now the strip mirrors the rest of the
 * dashboard: it only ever shows what the active org produced.
 *
 * Dismissal is persisted via a cookie of the last-seen event id. the
 * strip stays hidden until something newer arrives.
 */
export async function StatusStrip() {
  const [ctx, lastSeen, flash] = await Promise.all([
    getCurrentContext(),
    readLastStatusSeenId(),
    readStatusFlash(),
  ]);
  if (!ctx) return null;

  // Flash messages win when present: they're a one-shot self-facing
  // confirmation ("You joined Family Circle") that the database doesn't
  // model. The cookie has a 20-second TTL so it disappears without us
  // needing to write during render (Next.js disallows that). After it
  // expires, normal event-based strips resume.
  if (flash) {
    return <StatusStripFlashRow message={flash} />;
  }

  const events = await listUserVisibleEvents({
    organizationIds: [ctx.organization.id],
    limit: 1,
  });
  const latest = events[0];
  if (!latest) return null;
  if (latest.id === lastSeen) return null;

  return <StatusStripRow event={latest} />;
}

function StatusStripFlashRow({ message }: { message: string }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-lg border border-sage/30 bg-sage/[0.07] px-3 py-1.5 text-[12px] text-[#3f5240]">
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
      className={`mt-2 flex items-center gap-3 rounded-lg border px-3 py-1.5 text-[12px] ${tone}`}
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
