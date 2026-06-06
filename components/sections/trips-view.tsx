import "server-only";

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { parseEventWhen } from "@/lib/utils/event-when";

type Row = {
  upload_id: string | null;
  title: string;
  location: string | null;
  occurred_at: string;
};
type Leg = {
  uploadId: string | null;
  date: string;
  sort: number;
  title: string;
  location: string;
};

/** Format a wall-clock YYYY-MM-DD without timezone re-zoning. */
function fmtDate(date: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function legLine(leg: Leg): string {
  const loc = leg.location && !leg.title.includes(leg.location) ? leg.location : "";
  return loc ? `${leg.title} · ${loc}` : leg.title;
}

/**
 * Travel "Trips" view. Reads the SAME extracted travel records that surface on
 * the calendar (travel-section memory_items, plus flight/ticket/itinerary
 * documents), so a flight that reached the calendar also shows here. Previously
 * this queried extracted_entities for doc_type="flight", which the image and
 * group extraction never produce, so photographed boarding passes appeared on
 * the calendar but never in Trips. Groups legs into trips by date proximity
 * (a gap of more than 14 days starts a new trip). Server-rendered.
 */
export async function TripsView({ orgId }: { orgId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memory_items")
    .select("upload_id, title, location, occurred_at, document_type, section")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .not("occurred_at", "is", null)
    .or("section.eq.travel,document_type.in.(boarding_pass,ticket,itinerary)")
    .order("occurred_at", { ascending: true });

  const legs: Leg[] = ((data ?? []) as Row[])
    .map((r): Leg | null => {
      const w = parseEventWhen(r.occurred_at);
      if (!w) return null;
      const [y, mo, d] = w.date.split("-").map(Number);
      return {
        uploadId: r.upload_id,
        date: w.date,
        sort: new Date(y, mo - 1, d).getTime(),
        title: r.title,
        location: r.location ?? "",
      };
    })
    .filter((x): x is Leg => x !== null)
    .sort((a, b) => a.sort - b.sort);

  if (legs.length === 0) {
    return (
      <p className="px-1 text-[13px] text-ink-faint">
        No trips detected yet. Upload a flight confirmation and Oria will group it into a trip.
      </p>
    );
  }

  // Group by 14-day proximity.
  const FOURTEEN_DAYS = 14 * 86_400_000;
  const trips: Leg[][] = [];
  for (const leg of legs) {
    const last = trips[trips.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && leg.sort - prev.sort <= FOURTEEN_DAYS) {
      last.push(leg);
    } else {
      trips.push([leg]);
    }
  }

  return (
    <ul className="space-y-3">
      {trips.map((trip, i) => {
        const label = trip.map((l) => l.location).find((l) => l) ?? trip[0].title;
        const start = trip[0].date;
        const end = trip[trip.length - 1].date;
        return (
          <li key={i} className="rounded-2xl border border-line bg-surface-raised p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-title min-w-0 truncate text-ink">{label}</p>
              <p className="text-body-sm shrink-0 text-ink-muted">
                {start === end ? fmtDate(start) : `${fmtDate(start)} to ${fmtDate(end)}`}
              </p>
            </div>
            <ul className="mt-2 space-y-1">
              {trip.map((leg, j) => (
                <li key={j}>
                  {leg.uploadId ? (
                    <Link
                      href={`/dashboard/uploads/${leg.uploadId}`}
                      className="text-body-sm transition-base flex items-center gap-2 text-ink-soft hover:text-ink"
                    >
                      <span className="shrink-0 text-ink-faint">{fmtDate(leg.date)}</span>
                      <span className="min-w-0 truncate">{legLine(leg)}</span>
                    </Link>
                  ) : (
                    <div className="text-body-sm flex items-center gap-2 text-ink-soft">
                      <span className="shrink-0 text-ink-faint">{fmtDate(leg.date)}</span>
                      <span className="min-w-0 truncate">{legLine(leg)}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
