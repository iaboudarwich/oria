import { formatEventMessage, listUserVisibleEvents } from "@/lib/data/system-events";
import { getCurrentContext } from "@/lib/data/organizations";
import { readLastStatusSeenId, readStatusFlash } from "@/lib/data/status-strip";
import { getTranslations } from "next-intl/server";
import { StatusStripRow as StatusStripRowClient } from "./status-strip-row";

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

  const t = await getTranslations("status");
  return (
    <StatusStripRowClient
      id={latest.id}
      message={formatEventMessage(latest)}
      severity={latest.severity}
      historyLabel={t("view_in_history")}
    />
  );
}

function StatusStripFlashRow({ message }: { message: string }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-lg border border-sage/30 bg-sage/[0.07] px-3 py-1.5 text-[12px] text-[#3f5240]">
      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-sage" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{message}</span>
    </div>
  );
}
