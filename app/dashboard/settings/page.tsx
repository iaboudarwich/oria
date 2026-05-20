import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { deleteCustomSection } from "@/lib/data/custom-section-actions";
import {
  moveSection,
  toggleSectionHidden,
} from "@/lib/data/section-settings-actions";
import { listAllSections, type MergedSection } from "@/lib/data/all-sections";
import {
  getCurrentContext,
  listUserSpaces,
  type UserSpace,
} from "@/lib/data/organizations";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  EyeOffIcon,
  HeartIcon,
  LockIcon,
  PersonIcon,
} from "@/components/ui/icon";
import { SECTION_META, CustomSectionIcon } from "@/lib/sections-meta";
import { DeleteAccountPanel } from "@/components/settings/delete-account-panel";
import type { Section } from "@/lib/supabase/types";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [sections, ctx, spaces] = await Promise.all([
    listAllSections({ includeHidden: true, includeReview: false }),
    getCurrentContext(),
    listUserSpaces(),
  ]);

  const visible = sections.filter((s) => !s.hidden);
  const total = sections.length;
  const orgKind = ctx?.organization.kind ?? "personal";

  return (
    <>
      <Topbar title="Settings" />

      <div className="mx-auto max-w-2xl space-y-9 animate-fade-up">
        <ModesPanel orgKind={orgKind} />

        <GroupedSection
          label="How I organize my life"
          hint={`Reorder, hide, or add sections. ${visible.length} of ${total} visible.`}
          action={
            <Link
              href="/dashboard/settings/sections/new"
              className="inline-flex h-7 items-center rounded-md bg-ink px-2.5 text-[11.5px] text-surface hover:bg-ink-soft transition-base"
            >
              Add section
            </Link>
          }
        >
          {sections.map((s, i) => (
            <SectionRow
              key={`${s.ref.kind}-${s.ref.key}`}
              section={s}
              isFirst={i === 0}
              isLast={i === sections.length - 1}
            />
          ))}
        </GroupedSection>

        <CirclesPanel spaces={spaces} activeOrgId={ctx?.organization.id ?? null} />

        <DeleteAccountPanel />
      </div>
    </>
  );
}

function CirclesPanel({
  spaces,
  activeOrgId,
}: {
  spaces: UserSpace[];
  activeOrgId: string | null;
}) {
  const circles = spaces.filter((s) => s.organization.kind !== "personal");
  return (
    <GroupedSection
      label="Circles"
      hint={
        circles.length === 0
          ? "Invite someone to share what you choose."
          : `${circles.length} circle${circles.length === 1 ? "" : "s"} you're part of.`
      }
      action={
        <Link
          href="/dashboard/circles/new"
          className="inline-flex h-7 items-center rounded-md bg-ink px-2.5 text-[11.5px] text-surface hover:bg-ink-soft transition-base"
        >
          New circle
        </Link>
      }
    >
      {circles.length === 0 ? (
        <li className="px-4 py-3 text-[12.5px] text-ink-faint">
          You haven&apos;t joined or created any circles yet.
        </li>
      ) : (
        circles.map((s) => {
          const isActive = s.organization.id === activeOrgId;
          return (
            <li
              key={s.organization.id}
              className="flex items-center gap-3 px-3 py-2.5 transition-base hover:bg-canvas/60"
            >
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-ink-muted">
                <HeartIcon size={14} />
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

function SectionRow({
  section,
  isFirst,
  isLast,
}: {
  section: MergedSection;
  isFirst: boolean;
  isLast: boolean;
}) {
  const Icon =
    section.ref.kind === "builtin"
      ? SECTION_META[section.ref.key as Section].Icon
      : CustomSectionIcon;
  const isCustom = section.ref.kind === "custom";

  return (
    <li
      className={`flex items-center gap-2 px-2 py-2 transition-base hover:bg-canvas/60 ${
        section.hidden ? "opacity-55" : ""
      }`}
    >
      <MoveButton target={section.ref} dir="up" disabled={isFirst} />
      <MoveButton target={section.ref} dir="down" disabled={isLast} />

      <span className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center text-ink-muted">
        <Icon size={14} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] text-ink">{section.name}</p>
        <p className="text-[11.5px] text-ink-faint">
          {section.ref.kind === "builtin" ? "Built in" : "Custom"}
          {section.hidden ? " · hidden" : ""}
        </p>
      </div>

      <HideButton target={section.ref} hidden={section.hidden} />

      {isCustom ? (
        <>
          <Link
            href={`/dashboard/settings/sections/${section.ref.key}/edit`}
            className="text-[11.5px] text-ink-muted hover:text-ink transition-base"
          >
            Edit
          </Link>
          <form action={deleteCustomSection}>
            <input type="hidden" name="id" value={section.ref.key} />
            <button
              type="submit"
              className="text-[11.5px] text-ink-faint hover:text-claret transition-base"
            >
              Remove
            </button>
          </form>
        </>
      ) : null}
    </li>
  );
}

function MoveButton({
  target,
  dir,
  disabled,
}: {
  target: { kind: string; key: string };
  dir: "up" | "down";
  disabled: boolean;
}) {
  return (
    <form action={moveSection}>
      <input type="hidden" name="kind" value={target.kind} />
      <input type="hidden" name="key" value={target.key} />
      <input type="hidden" name="dir" value={dir} />
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-base hover:bg-canvas hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
        aria-label={dir === "up" ? "Move up" : "Move down"}
      >
        {dir === "up" ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
      </button>
    </form>
  );
}

function HideButton({
  target,
  hidden,
}: {
  target: { kind: string; key: string };
  hidden: boolean;
}) {
  return (
    <form action={toggleSectionHidden}>
      <input type="hidden" name="kind" value={target.kind} />
      <input type="hidden" name="key" value={target.key} />
      <button
        type="submit"
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] text-ink-muted transition-base hover:bg-canvas hover:text-ink"
        aria-label={hidden ? "Show section" : "Hide section"}
      >
        {hidden ? <EyeIcon size={12} /> : <EyeOffIcon size={12} />}
        {hidden ? "Show" : "Hide"}
      </button>
    </form>
  );
}
