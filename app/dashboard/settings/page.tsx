import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { listAllSections } from "@/lib/data/all-sections";
import {
  getCurrentContext,
  listUserSpaces,
  type UserSpace,
} from "@/lib/data/organizations";
import {
  HeartIcon,
  LockIcon,
  PersonIcon,
} from "@/components/ui/icon";
import { DeleteAccountPanel } from "@/components/settings/delete-account-panel";
import { SectionsEditor } from "@/components/settings/sections-editor";
import { isCurrentUserAdmin } from "@/lib/data/admin";
import { readSidebarExtras } from "@/lib/data/sidebar-prefs";
import { setSidebarExtra } from "@/lib/data/sidebar-prefs-actions";
import type { OrgKind } from "@/lib/supabase/types";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [sections, ctx, spaces, admin, extras] = await Promise.all([
    listAllSections({ includeHidden: true, includeReview: false }),
    getCurrentContext(),
    listUserSpaces(),
    isCurrentUserAdmin(),
    readSidebarExtras(),
  ]);
  const timelineEnabled = extras.has("timeline");

  const visible = sections.filter((s) => !s.hidden);
  const total = sections.length;
  const orgKind = ctx?.organization.kind ?? "personal";

  return (
    <>
      <Topbar title="Settings" />

      <div className="mx-auto max-w-2xl space-y-9 animate-fade-up">
        <ModesPanel orgKind={orgKind} />

        <section>
          <div className="mb-2 flex items-end justify-between px-1">
            <div>
              <h2 className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
                How I organize my life
              </h2>
              <p className="mt-1 text-[12px] text-ink-faint">
                {`Reorder, hide, or add sections. ${visible.length} of ${total} visible.`}
              </p>
            </div>
            <Link
              href="/dashboard/settings/sections/new"
              className="inline-flex h-7 items-center rounded-md bg-ink px-2.5 text-[11.5px] text-surface hover:bg-ink-soft transition-base"
            >
              Add section
            </Link>
          </div>
          <SectionsEditor sections={sections} />
        </section>

        <SpacesPanel
          spaces={spaces}
          activeOrgId={ctx?.organization.id ?? null}
          kind="circle"
        />

        <SpacesPanel
          spaces={spaces}
          activeOrgId={ctx?.organization.id ?? null}
          kind="office"
        />

        <SidebarPrefsPanel timelineEnabled={timelineEnabled} />

        {admin ? <AdminPanel /> : null}

        <DeleteAccountPanel />
      </div>
    </>
  );
}

/**
 * Opt-in sidebar rows the user can pin. Default-off so the sidebar
 * stays uncluttered for the median user; the toggle posts to
 * setSidebarExtra which revalidates the dashboard layout.
 */
function SidebarPrefsPanel({ timelineEnabled }: { timelineEnabled: boolean }) {
  return (
    <GroupedSection
      label="Sidebar"
      hint="Pin extra rows the sidebar shows by default."
    >
      <li className="flex items-center gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] text-ink">Timeline</p>
          <p className="text-[11.5px] text-ink-faint">
            Recent activity across the active space.
          </p>
        </div>
        <form action={setSidebarExtra}>
          <input type="hidden" name="extra" value="timeline" />
          <input
            type="hidden"
            name="enabled"
            value={timelineEnabled ? "off" : "on"}
          />
          <button
            type="submit"
            className={`inline-flex h-7 cursor-pointer items-center rounded-md border px-2.5 text-[11.5px] transition-base ${
              timelineEnabled
                ? "border-ink bg-ink text-surface"
                : "border-line bg-canvas text-ink-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            {timelineEnabled ? "On" : "Off"}
          </button>
        </form>
      </li>
    </GroupedSection>
  );
}

/** Only rendered when the signed-in user's email is on ADMIN_EMAILS.
 *  Non-admins never see the link; the page itself also re-checks. */
function AdminPanel() {
  return (
    <GroupedSection
      label="Admin"
      hint="Operator-only views. Read-only."
    >
      <li className="flex items-center gap-3 px-3 py-2.5 transition-base hover:bg-canvas/60">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-ink-muted">
          <LockIcon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] text-ink">System Health</p>
          <p className="text-[11.5px] text-ink-faint">
            AI usage, storage, database, deploy, warnings.
          </p>
        </div>
        <Link
          href="/dashboard/admin/health"
          className="text-[11.5px] text-ink-muted hover:text-ink transition-base"
        >
          Open
        </Link>
      </li>
    </GroupedSection>
  );
}

/**
 * Renders one group per space-kind (Circles or Workspaces). Splitting
 * the two means the user never has to decode why a "Property manager"
 * lives under a header called Circles.
 */
function SpacesPanel({
  spaces,
  activeOrgId,
  kind,
}: {
  spaces: UserSpace[];
  activeOrgId: string | null;
  kind: Extract<OrgKind, "circle" | "office">;
}) {
  const filtered = spaces.filter((s) => s.organization.kind === kind);
  const isWork = kind === "office";
  const label = isWork ? "Workspaces" : "Circles";
  const noun = isWork ? "Workspace" : "circle";
  const newHref = isWork ? "/dashboard/work/spaces/new" : "/dashboard/circles/new";
  const emptyMessage = isWork
    ? "You haven't created any Workspaces yet."
    : "You haven't joined or created any circles yet.";
  const hint =
    filtered.length === 0
      ? isWork
        ? "Create a Workspace for an office, property, investment, or project."
        : "Invite someone to share what you choose."
      : `${filtered.length} ${noun}${filtered.length === 1 ? "" : "s"} you're part of.`;

  return (
    <GroupedSection
      label={label}
      hint={hint}
      action={
        <Link
          href={newHref}
          className="inline-flex h-7 cursor-pointer items-center rounded-md bg-ink px-2.5 text-[11.5px] text-surface hover:bg-ink-soft transition-base"
        >
          New {noun}
        </Link>
      }
    >
      {filtered.length === 0 ? (
        <li className="px-4 py-3 text-[12.5px] text-ink-faint">
          {emptyMessage}
        </li>
      ) : (
        filtered.map((s) => {
          const isActive = s.organization.id === activeOrgId;
          return (
            <li
              key={s.organization.id}
              className="flex items-center gap-3 px-3 py-2.5 transition-base hover:bg-canvas/60"
            >
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-ink-muted">
                {isWork ? <LockIcon size={14} /> : <HeartIcon size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] text-ink">
                  {s.organization.name}
                  {isActive ? (
                    <span className="ml-2 inline-flex items-center gap-1 rounded bg-sage/15 px-1.5 py-0.5 text-[10.5px] text-[#3f5240]">
                      <span className="h-1 w-1 rounded-full bg-sage" />
                      Active
                    </span>
                  ) : null}
                </p>
                <p className="text-[11.5px] text-ink-faint">
                  {s.membership.role === "owner" ? "Owner" : "Member"}
                </p>
              </div>
              <Link
                href={isActive ? "/dashboard/circle" : "/dashboard"}
                className="text-[11.5px] text-ink-muted hover:text-ink transition-base"
              >
                {isActive ? "Manage" : "Switch to manage"}
              </Link>
            </li>
          );
        })
      )}
    </GroupedSection>
  );
}

function GroupedSection({
  label,
  hint,
  action,
  children,
}: {
  label: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-end justify-between px-1">
        <div>
          <h2 className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
            {label}
          </h2>
          {hint ? (
            <p className="mt-1 text-[12px] text-ink-faint">{hint}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-[0_1px_2px_rgba(28,26,23,0.04),0_2px_8px_-6px_rgba(28,26,23,0.08)]">
        <ul className="divide-y divide-line">{children}</ul>
      </div>
    </section>
  );
}

function ModesPanel({ orgKind }: { orgKind: string }) {
  const modes: Array<{
    id: "personal" | "circle" | "private";
    Icon: React.ComponentType<{ size?: number }>;
    label: string;
    body: string;
    cta: { label: string; href: string };
    active: boolean;
  }> = [
    {
      id: "personal",
      Icon: PersonIcon,
      label: "Personal",
      body: "Just me. Uploads stay in your own space.",
      cta: { label: "You're here", href: "/dashboard" },
      active: orgKind === "personal",
    },
    {
      id: "circle",
      Icon: HeartIcon,
      label: "Circle",
      body: "Partner, family, or assistant. Share what you choose.",
      cta: { label: "Open Circle", href: "/dashboard/circle" },
      active: orgKind === "circle",
    },
    {
      id: "private",
      Icon: LockIcon,
      label: "Private Oria",
      body: "Self-hosted for an office or team. Local AI, confidential files.",
      cta: { label: "Preview", href: "/dashboard/private" },
      active: orgKind === "office",
    },
  ];

  return (
    <GroupedSection
      label="How you use Oria"
      hint="Individual by default. Add a circle or set up Private Oria when you're ready."
    >
      {modes.map((m) => (
        <li
          key={m.id}
          className="flex items-center gap-3 px-3 py-2.5 transition-base hover:bg-canvas/60"
        >
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-ink-muted">
            <m.Icon size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] text-ink">
              {m.label}
              {m.active ? (
                <span className="ml-2 inline-flex items-center gap-1 rounded bg-sage/15 px-1.5 py-0.5 text-[10.5px] text-[#3f5240]">
                  <span className="h-1 w-1 rounded-full bg-sage" />
                  Active
                </span>
              ) : null}
            </p>
            <p className="text-[11.5px] text-ink-faint">{m.body}</p>
          </div>
          <Link
            href={m.cta.href}
            className="text-[11.5px] text-ink-muted hover:text-ink transition-base"
          >
            {m.cta.label}
          </Link>
        </li>
      ))}
    </GroupedSection>
  );
}

