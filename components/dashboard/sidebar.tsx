"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import {
  BoxIcon,
  CalendarIcon,
  ChartIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DocumentIcon,
  GiftIcon,
  HeartIcon,
  HomeIcon,
  InboxIcon,
  LinkIcon,
  MenuIcon,
  PersonIcon,
  PlaneIcon,
  PropertiesIcon,
  PulseIcon,
  ScalesIcon,
  SearchIcon,
  SettingsIcon,
  SparkIcon,
  StaffIcon,
  TagIcon,
  WalletIcon,
} from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import {
  SpaceSwitcher,
  type SpaceSummary,
} from "@/components/dashboard/space-switcher";
import { ModeToggle } from "@/components/dashboard/mode-toggle";
import { UserMenu } from "@/components/dashboard/user-menu";
import { ReportProblemButton } from "@/components/feedback/report-problem-button";

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
// Timeline + Members used to live here too. Timeline is now an opt-in
// extra (Settings → Sidebar), and Members moved into the account menu
// since it's a per-space management thing, not a place you visit often.
const personalSecondaryNav: NavItem[] = [
  { label: "Uploads", href: "/dashboard/inbox", icon: InboxIcon },
  { label: "Calendar", href: "/dashboard/calendar", icon: CalendarIcon },
  { label: "Items", href: "/dashboard/things", icon: BoxIcon },
  { label: "Trackables", href: "/dashboard/trackables", icon: CheckIcon },
];

// Work mode: business-focused nav. AI Agent sits right under Ask Oria as
// the persistent operational brain for the Workspace. Team has moved
// to the account menu, same logic as Personal/Members.
const workSecondaryNav: NavItem[] = [
  { label: "AI Agent", href: "/dashboard/work/agent", icon: SparkIcon },
  { label: "Analysis", href: "/dashboard/work/analysis", icon: ChartIcon },
  { label: "Uploads", href: "/dashboard/inbox", icon: InboxIcon },
  { label: "Finance", href: "/dashboard/work/finance", icon: WalletIcon },
  { label: "Contracts", href: "/dashboard/work/contracts", icon: ScalesIcon },
  { label: "Invoices", href: "/dashboard/work/invoices", icon: DocumentIcon },
  { label: "Calendar", href: "/dashboard/calendar", icon: CalendarIcon },
  { label: "Reports", href: "/dashboard/work/reports", icon: PulseIcon },
  { label: "Items", href: "/dashboard/things", icon: BoxIcon },
  { label: "Trackables", href: "/dashboard/trackables", icon: CheckIcon },
];

// Optional rows the user can opt into from Settings → Sidebar. Layout
// resolves which ones are enabled and concatenates them onto whichever
// secondary nav matches the active mode.
export const SIDEBAR_EXTRA_ITEMS: Record<string, NavItem> = {
  timeline: {
    label: "Timeline",
    href: "/dashboard/timeline",
    icon: PulseIcon,
  },
};

// System tier, always at the bottom. Settings used to live here too,
// but it moved into the account menu (UserMenu) so the sidebar stays
// focused on places and the account row owns account-level actions.
// System tier. "Private Oria" moved into the feature index (rare/long-tail);
// "What can Oria do?" surfaces the full feature list. Connections gets its own
// status row below (rendered separately so it can show a health dot).
const systemNav: NavItem[] = [
  { label: "What can Oria do?", href: "/dashboard/features", icon: SparkIcon },
  { label: "Deleted", href: "/dashboard/trash", icon: CloseIcon },
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
  /** Profile id, threaded through for the Report-a-problem context. */
  userId: string;
  /** Resolved label for the "Things" area (custom, or per-template default). */
  thingsLabel: string;
  org: { name: string; role: string };
  /** Current top-level mode. Drives which nav cluster appears below the
   * Sections group + which spaces show in the switcher. */
  mode: "personal" | "work";
  sections: SidebarSection[];
  spaces: SpaceSummary[];
  activeSpace: SpaceSummary;
  /** Whether the signed-in user's email is on ADMIN_EMAILS. Drives the
   *  Admin link inside the account menu. Resolved server-side in the
   *  layout so the menu never has to make its own decision. */
  isAdmin: boolean;
  /** Active org kind drives Members/Team visibility in the account
   *  menu. there's nothing to manage in a Personal space. */
  orgKind: "personal" | "circle" | "office";
  /** Opt-in sidebar rows the user has enabled (Settings → Sidebar).
   *  Layout resolves these from a cookie; sidebar just renders them. */
  extras: string[];
  /** Email-connection sync health for the utility-cluster status dot. */
  connectionsHealth?: "ok" | "error" | "none";
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
  userId,
  thingsLabel,
  mode,
  sections,
  spaces,
  activeSpace,
  isAdmin,
  orgKind,
  extras,
  connectionsHealth = "none",
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
        className={`fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden border-e border-line glass shadow-lg transition-[width,transform] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] max-lg:!w-[260px] lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header: wordmark links to dashboard. Collapse toggle on the right. */}
        <div
          className={`flex items-center py-4 ${
            collapsed ? "justify-center px-2" : "justify-between px-5"
          }`}
        >
          {collapsed ? null : (
            <Wordmark
              href={mode === "work" ? "/dashboard/work" : "/dashboard"}
              onClick={close}
            />
          )}
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
          {/* TIER 1. Ask Oria, the primary action. Alone, with a ⌘K hint. */}
          <PrimaryRow
            item={primaryAction}
            pathname={pathname}
            onNavigate={close}
            collapsed={collapsed}
          />

          {/* TIER 2. Sections, the user's organized world. Personal mode
           * only. Work mode has its own tightly-scoped nav below. */}
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

          {/* TIER 3. Mode-specific navigation, plus any opt-in extras
           * the user has enabled (Settings → Sidebar). */}
          <Divider collapsed={collapsed} />
          <ul className="flex flex-col gap-0.5">
            {[
              ...(mode === "work" ? workSecondaryNav : personalSecondaryNav),
              ...extras
                .map((k) => SIDEBAR_EXTRA_ITEMS[k])
                .filter((it): it is NavItem => !!it),
            ].map(
              (raw) => {
                // The "Things" area is renamable per space (and defaults to
                // "Assets" for asset-heavy templates).
                const item =
                  raw.href === "/dashboard/things"
                    ? { ...raw, label: thingsLabel }
                    : raw;
                return (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      pathname={pathname}
                      onNavigate={close}
                      collapsed={collapsed}
                    />
                  </li>
                );
              },
            )}
          </ul>

          {/* Manage sections: a real, visible button (not a faint gear) so
              every space, Personal or Work, has an obvious path to edit,
              hide, and rename its sections. */}
          {!collapsed ? (
            <div className="mt-3 px-1">
              <Button
                href="/dashboard/settings/sections"
                variant="secondary"
                size="sm"
                className="w-full"
              >
                <SettingsIcon size={13} />
                Manage sections
              </Button>
            </div>
          ) : null}

          {/* TIER 4. System. Pinned to the bottom. */}
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
              {/* Connections status: persistent path to email sync health with
                  an at-a-glance dot (green active, red needs attention). */}
              <li>
                <NavLink
                  item={{ label: "Connections", href: "/dashboard/settings?tab=connections", icon: LinkIcon }}
                  pathname={pathname}
                  onNavigate={close}
                  quiet
                  collapsed={collapsed}
                  trailingDot={
                    connectionsHealth === "none"
                      ? undefined
                      : connectionsHealth === "error"
                        ? "bg-claret"
                        : "bg-sage"
                  }
                />
              </li>
            </ul>
            {/* Report a problem: persistent, quiet, available from every
                dashboard page. Opens the shared report dialog. */}
            <ReportProblemButton userId={userId} collapsed={collapsed} />

            {/* Discreet security-disclosure link at the very bottom.
                Doesn't merit a top-level nav slot, but every page should
                give a path to it for outsiders who land here. */}
            {!collapsed ? (
              <Link
                href="/security"
                prefetch={false}
                className="mt-3 block px-3 py-1 text-[10.5px] uppercase tracking-[0.10em] text-ink-faint transition-base hover:text-ink-muted"
              >
                Security
              </Link>
            ) : null}
          </div>
        </nav>

        <UserMenu
          user={user}
          isAdmin={isAdmin}
          orgKind={orgKind}
          collapsed={collapsed}
        />
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
      className={`group relative brand-indicator flex items-center gap-2.5 rounded-lg transition-base ${
        collapsed ? "justify-center px-0 py-2" : "px-3 py-2"
      } ${
        active
          ? "active bg-brand-muted text-brand font-medium"
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
        className="flex w-full items-center gap-1.5 rounded-md px-3 py-1 text-eyebrow transition-base hover:text-ink-muted"
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
                  className={`group relative brand-indicator flex min-h-[36px] items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] transition-base ${
                    active
                      ? "active bg-brand-muted text-brand font-medium"
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
  trailingDot,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
  quiet?: boolean;
  collapsed?: boolean;
  /** Tailwind bg-* class for a small status dot, or undefined for none. */
  trailingDot?: string;
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
          ? "bg-brand-muted text-brand font-medium"
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
          {trailingDot ? (
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${trailingDot}`} aria-hidden />
          ) : null}
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

