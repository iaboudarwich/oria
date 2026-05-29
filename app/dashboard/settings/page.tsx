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
import { ResetAccountPanel } from "@/components/settings/reset-account-panel";
import { SectionsEditorLazy } from "@/components/settings/sections-editor-lazy";
import { isCurrentUserAdmin } from "@/lib/data/admin";
import { readSidebarExtras } from "@/lib/data/sidebar-prefs";
import { setSidebarExtra } from "@/lib/data/sidebar-prefs-actions";
import { getUserStorageStats, type StorageStats } from "@/lib/data/quotas";
import { formatBytes } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/settings/language-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { OrgKind } from "@/lib/supabase/types";
import type { Locale } from "@/i18n/config";

export const metadata = { title: "Settings" };

const TABS = [
  { key: "general",    label: "General" },
  { key: "sections",   label: "Sections" },
  { key: "circles",    label: "Circles" },
  { key: "workspaces", label: "Workspaces" },
  { key: "storage",    label: "Storage" },
  { key: "privacy",    label: "Privacy" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp: Record<string, string | string[] | undefined> = await (
    searchParams ?? Promise.resolve({})
  );
  const rawTab = typeof sp.tab === "string" ? sp.tab : "general";
  const tab: TabKey = (TABS.map((t) => t.key) as string[]).includes(rawTab)
    ? (rawTab as TabKey)
    : "general";
  const [sections, ctx, spaces, admin, extras] = await Promise.all([
    listAllSections({ includeHidden: true, includeReview: false }),
    getCurrentContext(),
    listUserSpaces(),
    isCurrentUserAdmin(),
    readSidebarExtras(),
  ]);
  const storageStats = ctx?.profile.id
    ? await getUserStorageStats(ctx.profile.id)
    : null;
  const timelineEnabled = extras.has("timeline");

  const visible = sections.filter((s) => !s.hidden);
  const total = sections.length;
  const orgKind = ctx?.organization.kind ?? "personal";

  return (
    <>
      <Topbar title="Settings" />

      {/* Tab bar */}
      <div className="mb-6 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 border-b border-line">
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/dashboard/settings?tab=${t.key}`}
              className={`shrink-0 px-3 py-2.5 text-[13px] transition-base border-b-2 -mb-px ${
                tab === t.key
                  ? "border-ink text-ink font-medium"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mx-auto max-w-2xl space-y-9 animate-fade-up">
        {tab === "general" && (
          <>
            <ModesPanel orgKind={orgKind} />
            <SidebarPrefsPanel timelineEnabled={timelineEnabled} />
            {/* Appearance */}
            <section>
              <h2 className="mb-3 px-1 text-eyebrow">
                Appearance
              </h2>
              <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised px-4 py-4 shadow-[0_1px_2px_rgba(28,26,23,0.04)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] text-ink">Theme</p>
                    <p className="text-[11.5px] text-ink-faint">Choose light, dark, or follow your system setting.</p>
                  </div>
                  <ThemeToggle />
                </div>
              </div>
            </section>

            {/* Language preferences */}
            <section>
              <h2 className="mb-3 px-1 text-eyebrow">
                Language
              </h2>
              <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised px-4 py-4 shadow-[0_1px_2px_rgba(28,26,23,0.04)]">
                <LanguageSwitcher
                  currentAccountLanguage={(ctx?.profile?.preferred_language ?? "en") as Locale}
                  currentWorkspaceLanguage={(ctx?.organization?.content_language ?? "en") as Locale}
                  organizationId={ctx?.organization.id ?? ""}
                  isOwner={ctx?.membership.role === "owner"}
                />
              </div>
            </section>
            {admin ? <AdminPanel /> : null}
          </>
        )}

        {tab === "sections" && (
          <section>
            <div className="mb-2 flex items-end justify-between px-1">
              <div>
                <h2 className="text-eyebrow">
                  Sections
                </h2>
                <p className="mt-1 text-[12px] text-ink-faint">
                  {`${visible.length} of ${total} visible.`}
                </p>
              </div>
              <Link
                href="/dashboard/settings/sections/new"
                className="inline-flex h-9 items-center rounded-md bg-ink px-3 text-[12px] text-surface hover:bg-ink-soft transition-base"
              >
                Add section
              </Link>
            </div>
            <SectionsEditorLazy sections={sections} />
          </section>
        )}

        {tab === "circles" && (
          <SpacesPanel
            spaces={spaces}
            activeOrgId={ctx?.organization.id ?? null}
            kind="circle"
          />
        )}

        {tab === "workspaces" && (
          <SpacesPanel
            spaces={spaces}
            activeOrgId={ctx?.organization.id ?? null}
            kind="office"
          />
        )}

        {tab === "storage" && (
          <>
            {storageStats ? <StorageSection stats={storageStats} /> : (
              <p className="text-[13px] text-ink-faint px-1">Storage stats unavailable.</p>
            )}
          </>
        )}

        {tab === "privacy" && (
          <>
            <div className="rounded-2xl border border-line bg-surface-raised px-4 py-3 text-[12.5px] text-ink-faint">
              Voice dictation uses OpenAI Whisper. Audio is sent to OpenAI for transcription only and is not retained per their terms of service.
            </div>
            <DataExportPanel />
            <ResetAccountPanel />
            <DeleteAccountPanel />
          </>
        )}
      </div>
    </>
  );
}

/**
 * Download-my-data button. Opens /api/account/export directly in the
 * browser. the response carries Content-Disposition: attachment so the
 * browser saves it as a file. Rate-limited to 1/day server-side.
 */
function DataExportPanel() {
  return (
    <section>
      <div className="mb-2 px-1">
        <h2 className="text-eyebrow">
          Your data
        </h2>
        <p className="mt-1 text-[12px] text-ink-faint">
          Download a copy of all your data as a JSON file: uploads metadata,
          reminders, conversations, and more.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-[0_1px_2px_rgba(28,26,23,0.04),0_2px_8px_-6px_rgba(28,26,23,0.08)]">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-[13px] text-ink">Export my data</p>
          <a
            href="/api/account/export"
            download
            className="text-[11.5px] text-ink-muted transition-base hover:text-ink hover:underline"
          >
            Download JSON
          </a>
        </div>
      </div>
    </section>
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
            className={`inline-flex h-9 cursor-pointer items-center rounded-md border px-2.5 text-[11.5px] transition-base ${
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
  // Circles get personal-language onboarding ("invite someone close");
  // Workspaces get team-language ("set up an office or property").
  const emptyMessage = isWork
    ? "Set up a Workspace for an office, property, or project."
    : "Invite a family member, partner, or assistant to share what you choose.";
  const hint =
    filtered.length === 0
      ? undefined
      : `${filtered.length} ${noun}${filtered.length === 1 ? "" : "s"}.`;

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
          <h2 className="text-eyebrow">
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

function StorageSection({ stats }: { stats: StorageStats }) {
  const {
    lifetimeUsedBytes,
    lifetimeLimitBytes,
    dailyUsedBytes,
    dailyLimitBytes,
  } = stats;
  const lifetimePct =
    lifetimeLimitBytes > 0
      ? Math.min(100, (lifetimeUsedBytes / lifetimeLimitBytes) * 100)
      : 0;
  const dailyPct =
    dailyLimitBytes > 0
      ? Math.min(100, (dailyUsedBytes / dailyLimitBytes) * 100)
      : 0;

  return (
    <GroupedSection label="Storage">
      <li className="px-4 py-4 space-y-4">
        <StorageBar
          label="Lifetime storage"
          used={lifetimeUsedBytes}
          limit={lifetimeLimitBytes}
          pct={lifetimePct}
        />
        <StorageBar
          label="Today's uploads"
          used={dailyUsedBytes}
          limit={dailyLimitBytes}
          pct={dailyPct}
        />
      </li>
    </GroupedSection>
  );
}

function StorageBar({
  label,
  used,
  limit,
  pct,
}: {
  label: string;
  used: number;
  limit: number;
  pct: number;
}) {
  const isWarning = pct >= 80 && pct < 100;
  const isFull = pct >= 100;
  const barColor = isFull
    ? "bg-claret"
    : isWarning
      ? "bg-amber-500"
      : "bg-ink";
  const usedColor = isFull
    ? "text-claret"
    : isWarning
      ? "text-amber-600"
      : "text-ink-muted";

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <p className="text-[12.5px] text-ink">{label}</p>
        <p className={`text-[11.5px] tabular-nums ${usedColor}`}>
          {formatBytes(used)} / {formatBytes(limit)}
        </p>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      {isFull && (
        <p className="text-[11px] text-claret">
          Storage full. Delete older uploads to continue adding files.
        </p>
      )}
      {isWarning && (
        <p className="text-[11px] text-amber-600">
          Approaching your limit. Consider deleting older uploads.
        </p>
      )}
    </div>
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
      label="Modes"
    >
      {modes.map((m) => (
        <li
          key={m.id}
          className="flex items-center gap-3 px-3 py-2 transition-base hover:bg-canvas/60"
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-ink-muted">
            <m.Icon size={13} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-ink">
              {m.label}
              {m.active ? (
                <span className="ml-2 inline-flex items-center gap-1 rounded bg-sage/15 px-1.5 py-0.5 text-[10.5px] text-[#3f5240]">
                  <span className="h-1 w-1 rounded-full bg-sage" />
                  Active
                </span>
              ) : null}
            </p>
            <p className="truncate text-[11px] text-ink-faint">{m.body}</p>
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

