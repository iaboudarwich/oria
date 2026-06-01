import "server-only";

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  upload_id: string | null;
  title: string;
  document_type: string | null;
  occurred_at: string | null;
  created_at: string;
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Map a raw document_type to a coarse timeline category for the filter.
function categoryOf(docType: string | null): string {
  if (!docType) return "Other";
  if (docType.includes("prescription")) return "Prescriptions";
  if (docType.includes("schedule") || docType.includes("appointment")) return "Appointments";
  if (docType.includes("lab") || docType.includes("result")) return "Lab results";
  return "Other";
}

/**
 * Health "Timeline" view. Chronological list of health items (newest first)
 * with the date on the left, plus a coarse type filter (?htype=). Each entry
 * links to its source upload when there is one. Server-rendered.
 */
export async function HealthTimelineView({
  orgId,
  filter,
}: {
  orgId: string;
  filter?: string;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memory_items")
    .select("id, upload_id, title, document_type, occurred_at, created_at")
    .eq("organization_id", orgId)
    .eq("section", "health")
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(100);
  const rows = (data ?? []) as Row[];

  if (rows.length === 0) {
    return (
      <p className="px-1 text-[13px] text-ink-faint">
        Health timeline will fill in as you add appointments, prescriptions, and
        results.
      </p>
    );
  }

  const withCat = rows.map((r) => ({ ...r, cat: categoryOf(r.document_type) }));
  const categories = Array.from(new Set(withCat.map((r) => r.cat)));
  const active = filter && categories.includes(filter) ? filter : "All";
  const shown = active === "All" ? withCat : withCat.filter((r) => r.cat === active);

  const base = "/dashboard/sections/health?view=timeline";
  const tabs = ["All", ...categories];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((c) => (
          <Link
            key={c}
            href={c === "All" ? base : `${base}&htype=${encodeURIComponent(c)}`}
            className={`rounded-full px-2.5 py-1 text-body-sm transition-base ${
              active === c
                ? "bg-ink text-surface"
                : "bg-canvas text-ink-muted hover:text-ink"
            }`}
          >
            {c}
          </Link>
        ))}
      </div>

      <ul className="space-y-0.5">
        {shown.map((r) => {
          const date = r.occurred_at ?? r.created_at;
          const inner = (
            <div className="flex gap-3 rounded-lg px-3 py-2 transition-base hover:bg-surface-raised">
              <span className="w-24 shrink-0 text-body-sm text-ink-faint">
                {fmt(date)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-ink">{r.title}</span>
                <span className="text-caption text-ink-faint">{r.cat}</span>
              </span>
            </div>
          );
          return (
            <li key={r.id}>
              {r.upload_id ? (
                <Link href={`/dashboard/uploads/${r.upload_id}`}>{inner}</Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
