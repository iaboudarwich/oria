import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { InviteCreator } from "@/components/circle/invite-creator";
import { InviteCard } from "@/components/circle/invite-card";
import { ManageMemberPanel } from "@/components/circle/manage-member-panel";
import { CircleSettings } from "@/components/circle/circle-settings";
import { TitleEditor } from "@/components/circle/title-editor";
import { getCurrentContext } from "@/lib/data/organizations";
import {
  listCircleMembers,
  listInviteSectionRefs,
  listPendingInvites,
  type CircleMember,
} from "@/lib/data/circle";
import {
  listMemberSectionRefs,
  type MemberSectionRef,
} from "@/lib/data/member-access";
import { ACCESS_LEVEL_LABELS } from "@/lib/data/access-labels";
import { listAllSections } from "@/lib/data/all-sections";
import { relativeTime } from "@/lib/utils";
import type { AccessLevel, Invite } from "@/lib/supabase/types";

export const metadata = { title: "Members" };

export default async function MembersPage() {
  const ctx = await getCurrentContext();
  if (!ctx) return null;

  if (ctx.organization.kind === "personal") {
    return <PersonalView name={ctx.profile.full_name ?? ctx.profile.email} />;
  }

  const [members, invites, sections] = await Promise.all([
    listCircleMembers(),
    listPendingInvites(),
    listAllSections({ includeHidden: false, includeReview: false }),
  ]);

  const isOwner = ctx.membership.role === "owner";
  const others = members.filter((m) => m.user_id !== ctx.profile.id);

  // Fetch section allowlists for any limited members in parallel.
  const limitedMembers = others.filter((m) => m.access_level === "limited");
  const memberAllowlists = new Map<string, MemberSectionRef[]>();
  await Promise.all(
    limitedMembers.map(async (m) => {
      const refs = await listMemberSectionRefs(m.id);
      memberAllowlists.set(m.id, refs);
    }),
  );

  // Same for limited invites.
  const limitedInvites = invites.filter((i) => i.access_level === "limited");
  const inviteAllowlists = new Map<
    string,
    Array<{ kind: "builtin" | "custom"; key: string }>
  >();
  await Promise.all(
    limitedInvites.map(async (i) => {
      const refs = await listInviteSectionRefs(i.id);
      inviteAllowlists.set(i.id, refs);
    }),
  );

  // Review is filtered out via `includeReview: false` above. Narrow the type
  // so child components (which only accept builtin/custom) typecheck.
  const sectionOptions = sections
    .filter((s) => s.ref.kind !== "review")
    .map((s) => ({
      ref: s.ref as { kind: "builtin" | "custom"; key: string },
      name: s.name,
    }));

  // Transfer-ownership candidates: every other member (not the current user).
  const transferCandidates = others.map((m) => ({
    membership_id: m.id,
    name: m.profile?.full_name ?? m.profile?.email ?? "Member",
    email: m.profile?.email ?? "",
  }));

  const isSoloOwner = isOwner && others.length === 0;

  return (
    <>
      <Topbar title={ctx.organization.name} />

      <p className="mb-6 max-w-xl text-[13.5px] text-ink-muted">
        Personal items stay private. Only what is shared into this{" "}
        {ctx.organization.kind === "office" ? "Workspace" : "circle"} is
        visible to members, based on the access you grant them.
      </p>

      <div className="space-y-8 animate-fade-up">
        <section>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">You</h2>
          <ul className="space-y-0.5">
            <MemberRow
              name={ctx.profile.full_name ?? ctx.profile.email}
              email={ctx.profile.email}
              role={ctx.membership.role}
              accessLevel={ctx.membership.access_level}
              isSelf
            />
          </ul>
        </section>

        {others.length > 0 ? (
          <section>
            <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
              People in this{" "}
              {ctx.organization.kind === "office" ? "Workspace" : "circle"}
            </h2>
            <ul className="space-y-2">
              {others.map((m) => (
                <li
                  key={m.id}
                  className="rounded-xl border border-line bg-surface-raised p-1.5"
                >
                  <MemberRow
                    name={m.profile?.full_name ?? m.profile?.email ?? "Member"}
                    email={m.profile?.email ?? ""}
                    role={m.role}
                    accessLevel={m.access_level}
                    title={m.title}
                    joinedAt={m.created_at}
                  />
                  {isOwner ? (
                    <div className="space-y-1 px-3 pb-2">
                      <TitleEditor
                        membershipId={m.id}
                        current={m.title}
                        orgKind={ctx.organization.kind}
                      />
                    </div>
                  ) : null}
                  {isOwner ? (
                    <ManageMemberPanel
                      member={{
                        id: m.id,
                        access_level: m.access_level,
                        firstName: firstName(m),
                      }}
                      sections={sectionOptions}
                      allowlist={memberAllowlists.get(m.id) ?? []}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {invites.length > 0 ? (
          <section>
            <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
              Pending invites
            </h2>
            <ul className="space-y-2">
              {invites.map((inv: Invite) => (
                <InviteCard
                  key={inv.id}
                  invite={inv}
                  sections={sectionOptions}
                  allowlist={inviteAllowlists.get(inv.id) ?? []}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {isOwner ? (
          <section className="max-w-xl rounded-2xl border border-line bg-surface-raised p-5 shadow-[0_1px_2px_rgba(28,26,23,0.04),0_2px_8px_-6px_rgba(28,26,23,0.08)]">
            <h2 className="mb-1 text-[13.5px] font-medium text-ink">
              Invite someone
            </h2>
            <p className="mb-4 text-[12px] text-ink-faint">
              They get a one-time link and a short code. Personal items stay
              private.
            </p>
            <InviteCreator
              sections={sectionOptions}
              orgKind={ctx.organization.kind}
            />
          </section>
        ) : null}

        <div className="max-w-xl">
          <CircleSettings
            circleName={ctx.organization.name}
            isOwner={isOwner}
            isSoloOwner={isSoloOwner}
            candidates={transferCandidates}
          />
        </div>
      </div>
    </>
  );
}

function PersonalView({ name }: { name: string }) {
  return (
    <>
      <Topbar title="Members" />

      <p className="mb-6 max-w-xl text-[13.5px] text-ink-muted">
        Personal is just you. Anything you upload here stays private.
      </p>

      <ul className="space-y-0.5">
        <MemberRow
          name={name}
          email={""}
          role="owner"
          accessLevel="owner"
          isSelf
        />
      </ul>

      <section className="mt-10 max-w-xl rounded-xl border border-line bg-surface-raised p-5">
        <h3 className="text-[14px] font-semibold text-ink">
          Want to share with someone?
        </h3>
        <p className="mt-1 text-[13px] text-ink-muted">
          Create a circle for your family, partner, roommates, or assistant.
          What you put inside a circle is only seen by people you invite, based
          on the access you give them.
        </p>
        <div className="mt-4">
          <Link
            href="/dashboard/circles/new"
            className="inline-flex h-10 items-center rounded-lg bg-ink px-4 text-[13px] text-surface hover:bg-ink-soft transition-base"
          >
            Create a circle
          </Link>
        </div>
      </section>
    </>
  );
}

function MemberRow({
  name,
  email,
  role,
  accessLevel,
  title,
  isSelf,
  joinedAt,
}: {
  name: string;
  email: string;
  role: string;
  accessLevel: AccessLevel;
  title?: string | null;
  isSelf?: boolean;
  joinedAt?: string;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sand text-ink-soft text-[11px] font-semibold">
        {initials || email[0]?.toUpperCase() || "?"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-ink">
          {name}
          {title ? (
            <span className="ml-2 text-[11.5px] text-ink-muted">{title}</span>
          ) : null}
          {isSelf ? (
            <span className="ml-2 text-[11px] text-ink-faint">you</span>
          ) : null}
        </p>
        <p className="truncate text-[11.5px] text-ink-faint">
          {ACCESS_LEVEL_LABELS[accessLevel]} · {roleLabel(role)}
          {joinedAt ? ` · joined ${relativeTime(joinedAt)}` : ""}
        </p>
      </div>
    </div>
  );
}

function firstName(m: CircleMember): string {
  const name = m.profile?.full_name?.trim() || m.profile?.email || "they";
  return name.split(/\s+/)[0] ?? "they";
}

function roleLabel(role: string): string {
  switch (role) {
    case "owner": return "Owner";
    case "household": return "Family";
    case "assistant": return "Assistant";
    case "accountant": return "Accountant";
    case "staff": return "Staff";
    case "external": return "Contributor";
    default: return role;
  }
}
