import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { listTrackables, daysUntilRenewal } from "@/lib/data/trackables";
import type { Trackable } from "@/lib/data/trackables";

export const metadata = { title: "Trackables" };
export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  insurance:     "Insurance",
  subscription:  "Subscriptions",
  lease:         "Leases",
  membership:    "Memberships",
  certification: "Certifications",
  id_document:   "ID Documents",
  contract:      "Contracts",
  warranty:      "Warranties",
  other:         "Other",
};

const CATEGORY_ORDER = [
  "insurance", "lease", "subscription", "membership",
  "certification", "id_document", "contract", "warranty", "other",
];

function countdownBadge(days: number | null) {
  if (days === null) return null;
  const label =
    days < 0
      ? `Expired ${Math.abs(days)}d ago`
      : days === 0
        ? "Expires today"
        : `${days}d left`;
  const color =
    days < 0
      ? "bg-claret/10 text-claret"
      : days <= 30
        ? "bg-claret/10 text-claret"
        : days <= 90
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-canvas text-ink-faint border-line";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10.5px] ${color}`}>
      {label}
    </span>
  );
}

function formatCost(t: Trackable): string {
  if (!t.cost_amount) return "";
  const cur = t.cost_currency ?? "USD";
  try {
    const formatted = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cur,
    }).format(t.cost_amount);
    return t.cost_period ? `${formatted} / ${t.cost_period.replace("_", " ")}` : formatted;
  } catch {
    return `${cur} ${t.cost_amount}`;
  }
}

export default async function TrackablesPage() {
  const trackables = await listTrackables();

  // Group by category
  const groups = new Map<string, Trackable[]>();
  for (const t of trackables) {
    if (!groups.has(t.category)) groups.set(t.category, []);
    groups.get(t.category)!.push(t);
  }

  const sortedCategories = CATEGORY_ORDER.filter((c) => groups.has(c));

  return (
    <>
      <Topbar title="Trackables" />
      <div className="animate-fade-up space-y-8">
        {trackables.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
            <p className="text-[14px] font-medium text-ink">No trackables yet</p>
            <p className="mt-1 text-[13px] text-ink-muted">
              Upload an insurance policy, subscription invoice, or ID document.
              Oria will detect it automatically.
            </p>
          </div>
        ) : (
          sortedCategories.map((cat) => {
            const items = groups.get(cat) ?? [];
            return (
              <section key={cat}>
                <h2 className="mb-3 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
                  {CATEGORY_LABELS[cat] ?? cat} ({items.length})
                </h2>
                <ul className="divide-y divide-line rounded-2xl border border-line bg-surface-raised overflow-hidden">
                  {items.map((t) => {
                    const days = daysUntilRenewal(t.renewal_date);
                    const cost = formatCost(t);
                    return (
                      <li key={t.id} className="px-4 py-3 hover:bg-canvas/60 transition-base">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              {t.source_upload_id ? (
                                <Link
                                  href={`/dashboard/uploads/${t.source_upload_id}`}
                                  className="font-medium text-[13.5px] text-ink hover:underline"
                                >
                                  {t.title}
                                </Link>
                              ) : (
                                <span className="font-medium text-[13.5px] text-ink">
                                  {t.title}
                                </span>
                              )}
                              {t.vendor && (
                                <span className="text-[12px] text-ink-faint">{t.vendor}</span>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-3 flex-wrap">
                              {t.renewal_date && (
                                <span className="text-[12px] text-ink-faint">
                                  Renews {new Date(t.renewal_date).toLocaleDateString(undefined, {
                                    month: "short", day: "numeric", year: "numeric",
                                  })}
                                </span>
                              )}
                              {cost && (
                                <span className="text-[12px] text-ink-faint">{cost}</span>
                              )}
                            </div>
                          </div>
                          {countdownBadge(days)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </>
  );
}
