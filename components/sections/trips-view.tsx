import "server-only";

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type FlightRow = { upload_id: string; fields: Record<string, unknown> };
type Flight = {
  uploadId: string;
  when: string;
  origin: string;
  dest: string;
  flight: string;
  airline: string;
};

function s(v: unknown): string {
  return v == null ? "" : String(v);
}
function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Travel "Trips" view. Auto-groups flights into trips by date proximity
 * (a gap of more than 14 days starts a new trip). One card per trip, each
 * flight linked back to its source upload. Server-rendered.
 */
export async function TripsView({ orgId }: { orgId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("extracted_entities")
    .select("upload_id, fields")
    .eq("organization_id", orgId)
    .eq("doc_type", "flight");

  const flights: Flight[] = ((data ?? []) as FlightRow[])
    .map((r) => ({
      uploadId: r.upload_id,
      when: s(r.fields.departure_datetime),
      origin: s(r.fields.origin_airport),
      dest: s(r.fields.destination_airport) || s(r.fields.airline),
      flight: s(r.fields.flight_number),
      airline: s(r.fields.airline),
    }))
    .filter((f) => f.when)
    .sort((a, b) => new Date(a.when).getTime() - new Date(b.when).getTime());

  if (flights.length === 0) {
    return (
      <p className="px-1 text-[13px] text-ink-faint">
        No trips detected yet. Upload a flight confirmation and Oria will group
        it into a trip.
      </p>
    );
  }

  // Group by 14-day proximity.
  const FOURTEEN_DAYS = 14 * 86_400_000;
  const trips: Flight[][] = [];
  for (const f of flights) {
    const last = trips[trips.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && new Date(f.when).getTime() - new Date(prev.when).getTime() <= FOURTEEN_DAYS) {
      last.push(f);
    } else {
      trips.push([f]);
    }
  }

  return (
    <ul className="space-y-3">
      {trips.map((trip, i) => {
        const dests = Array.from(new Set(trip.map((f) => f.dest).filter(Boolean)));
        const start = trip[0].when;
        const end = trip[trip.length - 1].when;
        return (
          <li
            key={i}
            className="rounded-2xl border border-line bg-surface-raised p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-title text-ink">
                {dests.length > 0 ? dests.join(", ") : "Trip"}
              </p>
              <p className="shrink-0 text-body-sm text-ink-muted">
                {start === end ? fmt(start) : `${fmt(start)} to ${fmt(end)}`}
              </p>
            </div>
            <ul className="mt-2 space-y-1">
              {trip.map((f, j) => (
                <li key={j}>
                  <Link
                    href={`/dashboard/uploads/${f.uploadId}`}
                    className="flex items-center gap-2 text-body-sm text-ink-soft transition-base hover:text-ink"
                  >
                    <span className="text-ink-faint">{fmt(f.when)}</span>
                    <span>
                      {f.origin ? `${f.origin} to ` : ""}
                      {f.dest}
                      {f.flight ? ` · ${f.flight}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
