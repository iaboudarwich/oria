import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/dashboard/topbar";
import { InviteCreator } from "@/components/circle/invite-creator";
import { InviteCard } from "@/components/circle/invite-card";
import { getCurrentContext } from "@/lib/data/organizations";
import { listAllSections } from "@/lib/data/all-sections";
import {
  listInviteSectionRefs,
  listPendingInvites,
} from "@/lib/data/circle";
import type { Invite } from "@/lib/supabase/types";

export const metadata = { title: "Invite people" };

type PageProps = { params: Promise<{ id: string }> };

export default async function CircleSetupPage({ params }: PageProps) {
  const { id } = await params;
  const ctx = await getCurrentContext();
  if (!ctx) notFound();
  if (ctx.organization.id !== id) {
    // Setup only makes sense in the active space; nudge them through the
    // switcher rather than guessing.
    redirect("/dashboard/circle");
  }
  if (ctx.organization.kind !== "circle") {
    redirect("/dashboard");
  }

  const [sections, invites] = await Promise.all([
    listAllSections({ includeHidden: false, includeReview: false }),
    listPendingInvites(),
  ]);

  const sectionOptions = sections
    .filter((s) => s.ref.kind !== "review")
    .map((s) => ({
      ref: s.ref as { kind: "builtin" | "custom"; key: string },
      name: s.name,
    }));

  const allowlists = new Map<
    string,
    Array<{ kind: "builtin" | "custom"; key: string }>
  >();
  await Promise.all(
    invites
      .filter((i: Invite) => i.access_level === "limited")
      .map(async (i: Invite) => {
        const refs = await listInviteSectionRefs(i.id);
        allowlists.set(i.id, refs);
      }),
  );

  return (
    <>
      <Topbar title={ctx.organization.name} />

      <div className="mx-auto max-w-2xl animate-fade-up">
        <Steps current={2} />

        <p className="mb-7 mt-5 px-1 text-[13px] text-ink-muted">
          Invite the people in this circle. Each person gets a one-time link
          and a short code. Personal items stay private. Only what is shared
          into this circle is visible.
        </p>

        <section className="rounded-2xl border border-line bg-surface-raised p-5 shadow-[0_1px_2px_rgba(28,26,23,0.04),0_2px_8px_-6px_rgba(28,26,23,0.08)]">
          <InviteCreator sections={sectionOptions} />
        </section>

        {invites.length > 0 ? (
          <section className="mt-8">
            <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
              Pending invites · {invites.length}
            </h2>
            <ul className="space-y-2">
              {invites.map((inv: Invite) => (
                <InviteCard
                  key={inv.id}
                  invite={inv}
                  sections={sectionOptions}
                  allowlist={allowlists.get(inv.id) ?? []}
                />
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-10 flex items-center gap-3 border-t border-line pt-6">
          <Link
            href="/dashboard/circle"
            className="inline-flex h-11 items-center rounded-xl bg-ink px-5 text-[13.5px] text-surface hover:bg-ink-soft transition-base"
          >
            Done, open my circle
          </Link>
          <Link
            href="/dashboard"
            className="text-[13px] text-ink-muted hover:text-ink transition-base"
          >
            Skip for now
          </Link>
        </div>
      </div>
    </>
  );
}

function Steps({ current }: { current: 1 | 2 }) {
  const labels = ["About this circle", "Invite people"];
  return (
    <ol className="flex items-center gap-2 px-1 text-[11.5px] text-ink-faint">
      {labels.map((label, i) => {
        const n = i + 1;
        const active = current === n;
        const done = current > n;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10.5px] ${
                active
                  ? "bg-ink text-surface"
                  : done
                    ? "bg-sage/20 text-[#3f5240]"
                    : "border border-line text-ink-faint"
              }`}
            >
              {done ? "✓" : n}
            </span>
            <span className={active ? "text-ink" : ""}>{label}</span>
            {i < labels.length - 1 ? (
              <span className="ml-1 h-px w-6 bg-line" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
