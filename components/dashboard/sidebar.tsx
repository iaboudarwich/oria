"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import {
  CalendarIcon,
  ChartIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DocumentIcon,
  GiftIcon,
  HeartIcon,
  HomeIcon,
  InboxIcon,
  LockIcon,
  MenuIcon,
  PersonIcon,
  PlaneIcon,
  PropertiesIcon,
  PulseIcon,
  ScalesIcon,
  SearchIcon,
  SettingsIcon,
  StaffIcon,
  TagIcon,
  UploadIcon,
  WalletIcon,
} from "@/components/ui/icon";
import {
  SpaceSwitcher,
  type SpaceSummary,
} from "@/components/dashboard/space-switcher";
import { ModeToggle } from "@/components/dashboard/mode-toggle";
import { signOut } from "@/lib/auth/actions";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  badge?: string;
  shortcut?: string;
};

// The emotional centerpiece: a single primary action at the top of the
// sidebar. Everything else is supporting cast.
const primaryAction: NavItem = {
  label: "Ask Oria",
  href: "/dashboard/ask",
  icon: SearchIcon,
  shortcut: "⌘K",
};

// Personal mode: secondary verbs + views below the Sections group.
const personalSecondaryNav: NavItem[] = [
  { label: "Upload", href: "/dashboard/inbox", icon: UploadIcon },
  { label: "Calendar", href: "/dashboard/calendar", icon: CalendarIcon },
  { label: "Timeline", href: "/dashboard/timeline", icon: PulseIcon },
  { label: "Members", href: "/dashboard/circle", icon: PersonIcon },
];

// Work mode: business-focused nav. Analysis is the centerpiece of Work
// (visual operational intelligence), so it sits at the top.
const workSecondaryNav: NavItem[] = [
  { label: "Analysis", href: "/dashboard/work/analysis", icon: ChartIcon },
  { label: "Uploads", href: "/dashboard/inbox", icon: UploadIcon },
  { label: "Finance", href: "/dashboard/work/finance", icon: WalletIcon },
  { label: "Contracts", href: "/dashboard/work/contracts", icon: ScalesIcon },
  { label: "Invoices", href: "/dashboard/work/invoices", icon: DocumentIcon },
  { label: "Calendar", href: "/dashboard/calendar", icon: CalendarIcon },
  { label: "Reports", href: "/dashboard/work/reports", icon: PulseIcon },
  { label: "Team", href: "/dashboard/circle", icon: PersonIcon },
];

// System tier, always at the bottom.
const systemNav: NavItem[] = [
  { label: "Settings", href: "/dashboard/settings", icon: SettingsIcon },
  { label: "Deleted", href: "/dashboard/trash", icon: CloseIcon },
  { label: "Private Oria", href: "/dashboard/private", icon: LockIcon, badge: "Preview" },
];

type SidebarSection = {
  label: string;
  href: string;
  kind: string; // "builtin" | "custom" | "review"
  key: string;
  badge?: string;
};

export type SidebarProps = {
  user: { name: string; email: string };
  org: { name: string; role: string };
  /** Current top-level mode. Drives which nav cluster appears below the
   * Sections group + which spaces show in the switcher. */
  mode: "personal" | "work";
  sections: SidebarSection[];
  spaces: SpaceSummary[];
  activeSpace: SpaceSummary;
  /** Desktop only. Mobile sidebar always shows full content when open. */
  collapsed?: boolean;
  onToggle?: () => void;
  sectionsOpen?: boolean;
  onToggleSections?: () => void;
};

const BUILTIN_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  household: HomeIcon,
  travel: PlaneIcon,
  properties: PropertiesIcon,
  staff: StaffIcon,
  events: GiftIcon,
  finance: WalletIcon,
  legal: ScalesIcon,
  personal: PersonIcon,
  vendors: TagIcon,
  health: HeartIcon,
};

const SMART_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  diet: HeartIcon,
  bills: WalletIcon,
};

function iconForSection(s: SidebarSection): React.ComponentType<{ size?: number }> {
  if (s.kind === "review") return InboxIcon;
  if (s.kind === "smart") return SMART_ICONS[s.key] ?? TagIcon;
  if (s.kind === "builtin") return BUILTIN_ICONS[s.key] ?? TagIcon;
  return TagIcon;
}

export function Sidebar({
  user,
  mode,
  sections,
  spaces,
  activeSpace,
  collapsed = false,
  onToggle,
  sectionsOpen = true,
  onToggleSections,
}: SidebarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-3 z-40 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface-raised text-ink-muted lg:hidden"
        aria-label="Open navigation"
      >
        <MenuIcon />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={close}
          aria-hidden
        />
      ) : null}

      <aside
        // Mobile: full-width drawer that slides in. Desktop: width follows
        // the CSS var set by SidebarShell so expand/collapse stays in sync
        // with the main content padding.
        style={{ width: "var(--sidebar-w, 250px)" }}
        className={`fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden border-r border-line bg-surface transition-[width,transform] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] max-lg:!w-[260px] lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header: wordmark links to dashboard. Collapse toggle on the right. */}
        <div
          className={`flex items-center py-4 ${
            collapsed ? "justify-center px-2" : "justify-between px-5"
          }`}
        >
          {collapsed ? null : <Wordmark href="/dashboard" onClick={close} />}
          {onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              className="hidden h-8 w-8 items-center justify-center rounded-lg text-ink-faint transition-base hover:bg-canvas/60 hover:text-ink lg:inline-flex"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <ChevronRightIcon size={13} />
              ) : (
                <ChevronLeftIcon size={13} />
              )}
            </button>
          ) : null}
          <button
            type="button"
            onClick={close}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:text-ink lg:hidden"
            aria-label="Close navigation"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Mode toggle: only visible when expanded. Above the space switcher
         * so the two reads are stacked correctly (mode, then space within
         * that mode). */}
        {!collapsed ? (
          <div className="mb-3">
            <ModeToggle active={mode} />
          </div>
        ) : null}

        {/* Space switcher: hidden when collapsed. */}
        {!collapsed ? (
          <SpaceSwitcher active={activeSpace} spaces={spaces} />
        ) : null}

        {/* The tiers + a user card at the bottom. */}
        <nav
          className={`mt-4 flex flex-1 flex-col overflow-y-auto pb-2 ${
            collapsed ? "px-2" : "px-3"
          }`}
        >
          {/* TIER 1 — Ask Oria, the primary action. Alone, with a ⌘K hint. */}
          <PrimaryRow
            item={primaryAction}
            pathname={pathname}
            onNavigate={close}
            collapsed={collapsed}
          />

          {/* TIER 2 — Sections, the user's organized world. Personal mode
           * only — Work mode has its own tightly-scoped nav below. */}
          {!collapsed && mode === "personal" ? (
            <>
              <Divider />
              <SectionsGroup
                open={sectionsOpen}
                onToggle={onToggleSections}
                sections={sections}
                pathname={pathname}
                onNavigate={close}
              />
            </>
          ) : null}

          {/* TIER 3 — Mode-specific navigation. */}
          <Divider collapsed={collapsed} />
          <ul className="flex flex-col gap-0.5">
            {(mode === "work" ? workSecondaryNav : personalSecondaryNav).map(
              (item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    pathname={pathname}
                    onNavigate={close}
                    collapsed={collapsed}
                  />
                </li>
              ),
            )}
          </ul>

          {/* TIER 4 — System. Pinned to the bottom. */}
          <div className="mt-auto pt-4">
            <Divider collapsed={collapsed} />
            <ul className="flex flex-col gap-0.5">
              {systemNav.map((item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    pathname={pathname}
                    onNavigate={close}
                    quiet
                    collapsed={collapsed}
                  />
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <UserCard user={user} collapsed={collapsed} />
      </aside>
    </>
  );
}

function Divider({ collapsed }: { collapsed?: boolean } = {}) {
  return (
    <div className={`my-2 h-px bg-line ${collapsed ? "mx-1" : "mx-2"}`} />
  );
}

function PrimaryRow({
  item,
  pathname,
  onNavigate,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
  collapsed: boolean;
}) {
  const active = pathname.startsWith(item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={`group flex items-center gap-2.5 rounded-lg transition-base ${
        collapsed ? "justify-center px-0 py-2" : "px-3 py-2"
      } ${
        active
          ? "bg-canvas text-ink"
          : "text-ink hover:bg-canvas/60"
      }`}
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center ${
          active ? "text-ink" : "text-ink-soft group-hover:text-ink"
        }`}
      >
        <Icon size={16} />
      </span>
      {!collapsed ? (
        <>
          <span className="flex-1 truncate text-[13.5px] font-medium">
            {item.label}
          </span>
          {item.shortcut ? (
            <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-ink-faint">
              {item.shortcut}
            </kbd>
          ) : null}
        </>
      ) : null}
    </Link>
  );
}

function SectionsGroup({
  open,
  onToggle,
  sections,
  pathname,
  onNavigate,
}: {
  open: boolean;
  onToggle?: () => void;
  sections: SidebarSection[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-md px-3 py-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint transition-base hover:text-ink-muted"
      >
        <span className="flex-1 text-left">Sections</span>
        <ChevronDownIcon
          size={11}
          className={`transition-transform duration-200 ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>
      {open ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {sections.map((s) => {
            const active = pathname === s.href;
            const Icon = iconForSection(s);
            const isReview = s.kind === "review";
            const isSmart = s.kind === "smart";
            return (
              <li key={`${s.kind}-${s.key}`}>
                <Link
                  href={s.href}
                  onClick={onNavigate}
                  title={isSmart ? `${s.label} · Smart Section` : undefined}
                  className={`group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[12.5px] transition-base ${
                    active
                      ? "bg-canvas text-ink"
                      : isReview || isSmart
                        ? "text-ink-soft hover:bg-canvas/60 hover:text-ink"
                        : "text-ink-muted hover:bg-canvas/60 hover:text-ink"
                  }`}
                >
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center ${
                      active
                        ? "text-ink-soft"
                        : isReview || isSmart
                          ? "text-ink-muted group-hover:text-ink-soft"
                          : "text-ink-faint group-hover:text-ink-muted"
                    }`}
                  >
                    <Icon size={14} />
                  </span>
                  <span className="flex-1 truncate">{s.label}</span>
                  {s.badge ? (
                    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-soft px-1.5 text-[10.5px] font-medium text-[#7a5a2a]">
                      {s.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href="/dashboard/settings/sections/new"
              onClick={onNavigate}
              className="group flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[12.5px] text-ink-faint transition-base hover:bg-canvas/60 hover:text-ink-muted"
            >
              <span className="inline-flex h-4 w-4 items-center justify-center text-[13px] leading-none">
                +
              </span>
              <span className="flex-1 truncate">New section</span>
            </Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

function NavLink({
  item,
  pathname,
  onNavigate,
  quiet,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
  quiet?: boolean;
  collapsed?: boolean;
}) {
  const active =
    item.href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(item.href);
  const Icon = item.icon;
  const text = quiet ? "text-[13px]" : "text-[13.5px]";
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={`group flex items-center gap-2.5 rounded-lg ${text} transition-base ${
        collapsed ? "justify-center px-0 py-2" : "px-3 py-2"
      } ${
        active
          ? "bg-canvas text-ink"
          : quiet
            ? "text-ink-muted hover:bg-canvas/60 hover:text-ink"
            : "text-ink-soft hover:bg-canvas/60 hover:text-ink"
      }`}
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center transition-base ${
          active
            ? "text-ink"
            : quiet
              ? "text-ink-faint group-hover:text-ink-muted"
              : "text-ink-muted group-hover:text-ink-soft"
        }`}
      >
        <Icon size={16} />
      </span>
      {!collapsed ? (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge ? (
            <span className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 text-[10.5px] text-ink-muted">
              {item.badge}
            </span>
          ) : null}
        </>
      ) : null}
    </Link>
  );
}

function UserCard({
  user,
  collapsed,
}: {
  user: { name: string; email: string };
  collapsed?: boolean;
}) {
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  if (collapsed) {
    return (
      <div className="border-t border-line p-2">
        <div
          className="flex justify-center rounded-xl px-1 py-2 hover:bg-canvas/60 transition-base"
          title={user.name}
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sand text-ink-soft text-[11px] font-semibold">
            {initials || user.email[0].toUpperCase()}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-canvas/60 transition-base">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sand text-ink-soft text-[11px] font-semibold">
          {initials || user.email[0].toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] text-ink">{user.name}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="text-[11px] text-ink-faint hover:text-ink transition-base"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
