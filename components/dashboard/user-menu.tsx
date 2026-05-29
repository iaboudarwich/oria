"use client";

import Link from "next/link";
import { signOut } from "@/lib/auth/actions";
import {
  LockIcon,
  PersonIcon,
  SettingsIcon,
  SparkIcon,
} from "@/components/ui/icon";
import { useDismissable } from "@/lib/hooks/use-dismissable";

/**
 * Bottom-left avatar pill in the sidebar. Click → small Apple-style
 * menu floats above the pill with: name + email header, Settings,
 * Admin (admin only), Sign out. Replaces the inline UserCard + the
 * separate "Settings" entry in the sidebar nav. the sidebar stays
 * focused on places, the account menu owns account-level actions.
 *
 * Collapsed sidebar: the menu pops to the RIGHT of the avatar instead
 * of above, because there's no width to anchor against.
 */
export function UserMenu({
  user,
  isAdmin,
  orgKind,
  collapsed,
}: {
  user: { name: string; email: string };
  isAdmin: boolean;
  /** Drives the Members link inside the menu. Personal is solo, so
   *  there's nothing to manage; Circles and Workspaces both have a
   *  members surface. */
  orgKind: "personal" | "circle" | "office";
  collapsed?: boolean;
}) {
  const { ref, open, toggle, setOpen } = useDismissable<HTMLDivElement>();
  const initials =
    user.name
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || user.email[0]?.toUpperCase() ||
    "?";

  return (
    <div ref={ref} className="relative border-t border-line p-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        title={collapsed ? user.name : undefined}
        className={`cta flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 transition-base hover:bg-canvas/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sand text-ink-soft text-[11px] font-semibold">
          {initials}
        </span>
        {!collapsed ? (
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-[12.5px] text-ink">
              {user.name}
            </span>
            <span className="block truncate text-[10.5px] text-ink-faint">
              Account
            </span>
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute z-40 w-[220px] overflow-hidden rounded-xl border border-line bg-surface-raised shadow-[0_10px_30px_-15px_rgba(28,26,23,0.20)] animate-fade-up ${
            collapsed
              ? "bottom-2 left-[calc(100%+8px)]"
              : "bottom-[calc(100%-2px)] left-2 right-2"
          }`}
        >
          {/* Header: identifies the account at a glance. Not clickable. */}
          <div className="border-b border-line px-3.5 py-3">
            <p className="truncate text-[13px] text-ink">{user.name}</p>
            <p className="truncate text-[11.5px] text-ink-faint">
              {user.email}
            </p>
          </div>

          <ul className="py-1">
            {orgKind !== "personal" ? (
              <MenuLink
                href="/dashboard/circle"
                icon={PersonIcon}
                label={orgKind === "office" ? "Team" : "Members"}
                onSelect={() => setOpen(false)}
              />
            ) : null}
            <MenuLink
              href="/onboarding/chat?mode=improve"
              icon={SparkIcon}
              label="Improve my Oria"
              onSelect={() => setOpen(false)}
            />
            <MenuLink
              href="/dashboard/settings"
              icon={SettingsIcon}
              label="Settings"
              onSelect={() => setOpen(false)}
            />
            {isAdmin ? (
              <MenuLink
                href="/dashboard/admin/health"
                icon={SparkIcon}
                label="Admin · System Health"
                onSelect={() => setOpen(false)}
              />
            ) : null}
          </ul>

          <div className="border-t border-line py-1">
            <form action={signOut}>
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-ink-soft transition-base hover:bg-canvas hover:text-ink"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center text-ink-faint">
                  <LockIcon size={13} />
                </span>
                <span className="flex-1">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  onSelect,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onSelect: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onSelect}
        className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-ink-soft transition-base hover:bg-canvas hover:text-ink"
      >
        <span className="inline-flex h-4 w-4 items-center justify-center text-ink-faint">
          <Icon size={13} />
        </span>
        <span className="flex-1 truncate">{label}</span>
      </Link>
    </li>
  );
}
