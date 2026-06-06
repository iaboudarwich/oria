import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const HEALTH_TABS = [
  "body",
  "diet",
  "movement",
  "sleep",
  "vitals",
  "supplements",
  "rituals",
] as const;

export type HealthTab = (typeof HEALTH_TABS)[number];

export function isHealthTab(v: string | undefined): v is HealthTab {
  return !!v && (HEALTH_TABS as readonly string[]).includes(v);
}

/** Sub-tab nav for the unified Health surface. Plain links (no client JS),
 *  horizontally scrollable on narrow screens, RTL-correct via logical flex. */
export async function HealthTabs({ active }: { active: HealthTab }) {
  const t = await getTranslations("health");
  return (
    <nav className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1">
      {HEALTH_TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            href={tab === "body" ? "/dashboard/health" : `/dashboard/health?tab=${tab}`}
            aria-current={isActive ? "page" : undefined}
            className={`transition-base shrink-0 rounded-xl px-3 py-1.5 text-[13px] ${
              isActive
                ? "bg-ink text-surface"
                : "text-ink-muted hover:bg-surface-raised hover:text-ink"
            }`}
          >
            {t(`tab_${tab}`)}
          </Link>
        );
      })}
    </nav>
  );
}
