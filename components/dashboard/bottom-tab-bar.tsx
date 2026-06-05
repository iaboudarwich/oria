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
import { CaptureButton } from "./capture-button";

/**
 * The primary navigation's small-screen face (Round 16.9). ONE nav, three
 * layouts:
 *   phone  (< md): a fixed bottom tab bar in the thumb zone.
 *   tablet (md to lg): the SAME destinations as a slim fixed left rail.
 *   desktop (>= lg): hidden here; the full Sidebar takes over (lg:hidden).
 * The "More" item opens the same Sidebar drawer on phone + tablet, so there is
 * one nav system, never two. Four destinations + More (never more than five).
 *
 * The center thumb-zone slot holds a prominent quick-capture "+" (CaptureButton)
 * that opens the capture sheet; it is one slot by design so the Round 19.5 voice
 * button can later replace or sit beside it. 56px tap targets clear the 44px
 * floor. RTL: the bottom bar uses a logical flex row; the rail sits on the same
 * side as the Sidebar.
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

  const itemClass = (active: boolean) =>
    `flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 transition-base md:min-h-0 md:h-14 ${
      active ? "text-brand" : "text-ink-muted hover:text-ink"
    }`;

  const tabItem = (tab: Tab) => {
    const active = isActive(tab.href, tab.exact);
    const Icon = tab.icon;
    return (
      <li key={tab.key} className="flex-1 md:flex-none">
        <Link
          href={tab.href}
          aria-current={active ? "page" : undefined}
          className={itemClass(active)}
        >
          <Icon size={20} />
          <span className="text-[10.5px] font-medium leading-none">{t(tab.key)}</span>
        </Link>
      </li>
    );
  };

  return (
    <nav
      aria-label={t("primary_nav")}
      className="fixed bottom-0 inset-x-0 z-40 border-t border-line glass pb-safe lg:hidden md:inset-x-auto md:inset-y-0 md:left-0 md:w-16 md:border-e md:border-t-0 md:pb-0 md:pt-safe"
    >
      <ul className="mx-auto flex max-w-[640px] items-stretch md:mx-0 md:h-full md:max-w-none md:flex-col md:justify-start md:gap-1 md:pt-3">
        {tabItem(TABS[0])}
        {tabItem(TABS[1])}
        {/* Center quick-capture action in the thumb zone. The single-slot design
            lets the Round 19.5 voice button replace or sit beside this "+". */}
        <li className="flex flex-1 items-center justify-center md:flex-none md:py-1">
          <CaptureButton />
        </li>
        {tabItem(TABS[2])}
        {tabItem(TABS[3])}
        <li className="flex-1 md:flex-none">
          <button
            type="button"
            onClick={onMore}
            className="flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 px-1 text-ink-muted transition-base hover:text-ink md:min-h-0 md:h-14"
          >
            <MenuIcon size={20} />
            <span className="text-[10.5px] font-medium leading-none">{t("more")}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
