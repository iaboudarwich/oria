import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/dashboard/topbar";
import { EmptyState } from "@/components/ui/empty-state";
import { PulseIcon } from "@/components/ui/icon";
import { listTrackables, daysUntilRenewal } from "@/lib/data/trackables";
import type { Trackable } from "@/lib/data/trackables";
import {
  AddTrackableForm,
  TrackableRowActions,
} from "@/components/trackables/trackable-controls";

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
  goal:          "Goals",
  wishlist:      "Wishlist",
  other:         "Other",
};

const CATEGORY_ORDER = [
  "insurance", "lease", "subscription", "membership",
  "certification", "id_document", "contract", "warranty",
  "goal", "wishlist", "other",
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
  const t = await getTranslations("empty");
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
        <div className="flex justify-end px-1">
          <AddTrackableForm />
        </div>
        {trackables.length === 0 ? (
          <EmptyState
            icon={<PulseIcon size={22} />}
            headline={t("trackables_headline")}
            description={t("trackables_desc")}
            cta={{ label: t("trackables_cta"), href: "/dashboard/inbox" }}
          />
        ) : (
          sortedCategories.map((cat) => {
            const items = groups.get(cat) ?? [];
            return (
              <section key={cat}>
                <h2 className="mb-3 px-1 text-eyebrow">
                  {CATEGORY_LABELS[cat] ?? cat} ({items.length})
                </h2>
                <ul className="divide-y divide-line rounded-2xl border border-line bg-surface-raised overflow-hidden">
                  {items.map((t) => {
                    const days = daysUntilRenewal(t.renewal_date);
                    const cost = formatCost(t);
                    const dimmed = t.status === "wont_do" ? "opacity-55" : "";
                    return (
                      <li key={t.id} className="px-4 py-3 hover:bg-canvas/60 transition-base">
                        <div className={`flex items-start gap-3 ${dimmed}`}>
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
                        <TrackableRowActions trackable={t} />
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
