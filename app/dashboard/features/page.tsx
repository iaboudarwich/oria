import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/dashboard/topbar";
import { TakeTourButton } from "@/components/onboarding/take-tour-button";

export const metadata = { title: "What can Oria do?" };

type Item = { id: string; href: string };

// Canonical feature index, grouped by area. Stable ids map to localized
// title/description; hrefs jump straight to the feature.
const GROUPS: { group: string; items: Item[] }[] = [
  {
    group: "capture",
    items: [
      { id: "upload", href: "/dashboard/inbox" },
      { id: "inbox", href: "/dashboard/sections/review" },
    ],
  },
  {
    group: "organize",
    items: [
      { id: "sections", href: "/dashboard/settings/sections" },
      { id: "things", href: "/dashboard/things" },
      { id: "reshape", href: "/dashboard/reshape" },
      { id: "learned_rules", href: "/dashboard/settings?tab=preferences" },
    ],
  },
  {
    group: "ask",
    items: [
      { id: "ask", href: "/dashboard/ask" },
      { id: "reasoning", href: "/dashboard/settings/ai" },
    ],
  },
  {
    group: "connect",
    items: [
      { id: "connect_ai", href: "/dashboard/settings/ai" },
      { id: "connect_email", href: "/dashboard/settings?tab=connections" },
      { id: "connect_calendar", href: "/dashboard/settings?tab=connections" },
      { id: "connect_drive", href: "/dashboard/settings?tab=connections" },
      { id: "connect_outlook", href: "/dashboard/settings?tab=connections" },
      { id: "connect_onedrive", href: "/dashboard/settings?tab=connections" },
      { id: "routing", href: "/dashboard/settings?tab=connections" },
    ],
  },
  {
    group: "track",
    items: [
      { id: "reminders", href: "/dashboard/reminders" },
      { id: "calendar", href: "/dashboard/calendar" },
      { id: "trackables", href: "/dashboard/trackables" },
    ],
  },
  {
    group: "secure",
    items: [
      { id: "security", href: "/dashboard/settings?tab=security" },
      { id: "privacy", href: "/privacy" },
      { id: "data", href: "/dashboard/settings?tab=privacy" },
      { id: "private", href: "/dashboard/private" },
    ],
  },
];

export default async function FeaturesPage() {
  const t = await getTranslations("features");

  return (
    <>
      <Topbar title={t("title")} />

      <div className="mx-auto max-w-2xl space-y-7 animate-fade-up">
        <div className="flex items-start justify-between gap-4">
          <p className="text-[13px] text-ink-muted">{t("subtitle")}</p>
          <TakeTourButton label={t("take_tour")} />
        </div>

        {GROUPS.map(({ group, items }) => (
          <section key={group} className="space-y-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
              {t(`group_${group}`)}
            </h2>
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface-raised">
              {items.map((item, i) => (
                <li key={item.id} className={i > 0 ? "border-t border-line" : ""}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-base hover:bg-canvas"
                  >
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium text-ink">
                        {t(`${item.id}.title`)}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] text-ink-muted">
                        {t(`${item.id}.desc`)}
                      </span>
                    </span>
                    <span aria-hidden className="shrink-0 text-ink-faint">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
