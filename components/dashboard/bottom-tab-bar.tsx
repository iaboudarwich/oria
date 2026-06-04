"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CalendarIcon,
  ChatIcon,
  HomeIcon,
  InboxIcon,
  MenuIcon,
} from "@/components/ui/icon";

/**
 * Mobile primary navigation: a fixed bottom tab bar (lg:hidden). The full side
 * rail collapses to a drawer on small viewports, reached via the "More" tab.
 * Tabs are the top destinations from current nav usage (Today, Ask, Calendar,
 * Uploads); everything else lives behind More. RTL-correct (logical flex row,
 * non-directional glyphs). 56px tap targets clear the 44px floor.
 */
type Tab = {
  key: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  exact?: boolean;
};
const TABS: Tab[] = [
  { key: "today", href: "/dashboard", icon: HomeIcon, exact: true },
  { key: "ask", href: "/dashboard/ask", icon: ChatIcon },
  { key: "calendar", href: "/dashboard/calendar", icon: CalendarIcon },
  { key: "uploads", href: "/dashboard/inbox", icon: InboxIcon },
];

export function BottomTabBar({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const t = useTranslations("sidebar");

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <nav
      aria-label={t("primary_nav")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line glass pb-safe lg:hidden"
    >
      <ul className="mx-auto flex max-w-[640px] items-stretch">
        {TABS.map((tab) => {
          const active = isActive(tab.href, tab.exact);
          const Icon = tab.icon;
          return (
            <li key={tab.key} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 transition-base ${
                  active ? "text-brand" : "text-ink-muted hover:text-ink"
                }`}
              >
                <Icon size={20} />
                <span className="text-[10.5px] font-medium leading-none">{t(tab.key)}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={onMore}
            className="flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 px-1 text-ink-muted transition-base hover:text-ink"
          >
            <MenuIcon size={20} />
            <span className="text-[10.5px] font-medium leading-none">{t("more")}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
