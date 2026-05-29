"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  regenerateInvite,
  resendInvite,
  revokeInvite,
  updateInviteAccess,
  type EmailOutcome,
} from "@/lib/data/circle-actions";
import {
  ACCESS_LEVEL_BLURBS,
  ACCESS_LEVEL_LABELS,
} from "@/lib/data/access-labels";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
} from "@/components/ui/icon";
import { InviteResultCard } from "./invite-result-card";
import { EmailStatusLine } from "./email-status-line";
import type { AccessLevel, Invite } from "@/lib/supabase/types";
import { relativeTime } from "@/lib/utils";

type SectionOption = {
  ref: { kind: "builtin" | "custom"; key: string };
  name: string;
};

export function InviteCard({
  invite,
  sections,
  allowlist,
}: {
  invite: Invite;
  sections: SectionOption[];
  allowlist: Array<{ kind: "builtin" | "custom"; key: string }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  // Auto-open when the invite is brand-new (created in the last 60s).
  // Computed once on mount via the lazy useState initializer so the open
  // state stays user-controlled after that. This is what makes Create
  // and "Get a fresh code" feel coherent: the new invite mounts open,
  // showing the code/link immediately, while older ones stay collapsed.
  const [open, setOpen] = useState(
    () => Date.now() - new Date(invite.created_at).getTime() < 60_000,
  );
  const [resendOutcome, setResendOutcome] = useState<EmailOutcome | null>(null);
  const [resending, startResend] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [codeCopied, setCodeCopied] = useState(false);

  const allowedBuiltin = new Set(
    allowlist.filter((r) => r.kind === "builtin").map((r) => r.key),
  );
  const allowedCustom = new Set(
    allowlist.filter((r) => r.kind === "custom").map((r) => r.key),
  );

  const display = invite.display_name || invite.email;
  const initials = display
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(invite.code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1400);
    } catch {
      // ignore
    }
  }

  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-surface-raised">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canvas text-ink-soft text-[11.5px] font-semibold">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[13.5px] text-ink">
            <span className="truncate">{display}</span>
            {invite.title ? (
              <span className="shrink-0 rounded-md bg-ink/[0.05] px-1.5 py-0.5 text-[10.5px] text-ink-muted">
                {invite.title}
              </span>
            ) : null}
          </p>
          <p className="truncate text-[11.5px] text-ink-faint">
            {invite.display_name ? `${invite.email} · ` : ""}
            {ACCESS_LEVEL_LABELS[invite.access_level]} · invited{" "}
            {relativeTime(invite.created_at)}
          </p>
        </div>

        <button
          type="button"
          onClick={copyCode}
          aria-label="Copy invite code"
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-[11.5px] tracking-[0.08em] transition-base ${
            codeCopied
              ? "border-sage/30 bg-sage/10 text-[#3f5240]"
              : "border-line bg-canvas/40 text-ink-soft hover:border-line-strong hover:text-ink"
          }`}
        >
          {codeCopied ? (
            <>
              <CheckIcon size={11} /> Copied
            </>
          ) : (
            <>
              <CopyIcon size={11} /> {invite.code}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Hide details" : "Show details"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-base hover:bg-canvas hover:text-ink"
        >
          {open ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-line bg-canvas/30 px-3.5 py-3.5">
          <InviteResultCard invite={invite} />

          {resendOutcome ? (
            <div className="mt-3">
              <EmailStatusLine outcome={resendOutcome} recipient={display} />
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <SmallButton
              onClick={() => setEditing((v) => !v)}
              active={editing}
            >
              {editing ? "Close" : "Edit access"}
            </SmallButton>
            <SmallButton
              disabled={resending || refreshing}
              onClick={() => {
                const fd = new FormData();
                fd.set("id", invite.id);
                startResend(async () => {
                  const result = await resendInvite(fd);
                  if (result.ok) setResendOutcome(result.data.emailOutcome);
                  else
                    setResendOutcome({ status: "failed", reason: result.error });
                });
              }}
            >
              {resending ? "Sending" : "Resend email"}
            </SmallButton>
            <SmallButton
              disabled={resending || refreshing}
              onClick={() => {
                const fd = new FormData();
                fd.set("id", invite.id);
                startRefresh(async () => {
                  const result = await regenerateInvite(fd);
                  if (result.ok) {
                    // The old card (this one) is about to unmount because
                    // regenerate revokes the old invite. The new invite
                    // mounts auto-open via the page's `defaultOpen` rule,
                    // so the user immediately sees the fresh code/link.
                    // no transient mismatch between code and card.
                    router.refresh();
                  } else {
                    setResendOutcome({ status: "failed", reason: result.error });
                  }
                });
              }}
            >
              {refreshing ? "Refreshing" : "Get a fresh code"}
            </SmallButton>
            <form action={revokeInvite} className="ml-auto">
              <input type="hidden" name="id" value={invite.id} />
              <button
                type="submit"
                className="inline-flex h-7 items-center rounded-md px-2 text-[11.5px] text-ink-faint transition-base hover:bg-claret/10 hover:text-claret"
              >
                Revoke
              </button>
            </form>
          </div>

          {editing ? (
            <EditAccessPanel
              invite={invite}
              sections={sections}
              allowedBuiltin={allowedBuiltin}
              allowedCustom={allowedCustom}
              onSaved={() => setEditing(false)}
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function SmallButton({
  children,
  onClick,
  active,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-7 items-center rounded-md border px-2.5 text-[11.5px] transition-base disabled:opacity-50 ${
        active
          ? "border-line-strong bg-canvas text-ink"
          : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function EditAccessPanel({
  invite,
  sections,
  allowedBuiltin,
  allowedCustom,
  onSaved,
}: {
  invite: Invite;
  sections: SectionOption[];
  allowedBuiltin: Set<string>;
  allowedCustom: Set<string>;
  onSaved: () => void;
}) {
  const [level, setLevel] = useState<AccessLevel>(invite.access_level);

  return (
    <form
      action={async (formData) => {
        await updateInviteAccess(formData);
        onSaved();
      }}
      className="mt-3 space-y-3 rounded-xl border border-line bg-surface p-3"
    >
      <input type="hidden" name="id" value={invite.id} />

      <div className="space-y-1">
        {(["full", "limited", "assigned"] as AccessLevel[]).map((lvl) => (
          <label
            key={lvl}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-canvas/60 px-2.5 py-1.5 transition-base hover:border-line-strong has-[:checked]:border-ink has-[:checked]:bg-canvas"
          >
            <input
              type="radio"
              name="access_level"
              value={lvl}
              checked={level === lvl}
              onChange={() => setLevel(lvl)}
              className="mt-0.5 h-3.5 w-3.5 accent-ink"
            />
            <span className="min-w-0">
              <span className="block text-[12.5px] text-ink">
                {ACCESS_LEVEL_LABELS[lvl]}
              </span>
              <span className="block text-[11px] text-ink-faint">
                {ACCESS_LEVEL_BLURBS[lvl]}
              </span>
            </span>
          </label>
        ))}
      </div>

      {level === "limited" ? (
        <div>
          <p className="mb-1.5 text-[11.5px] text-ink-muted">Which sections?</p>
          {sections.length === 0 ? (
            <p className="rounded-md border border-line bg-canvas/60 px-2.5 py-1.5 text-[11.5px] text-ink-faint">
              No sections yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {sections.map((s) => {
                const checked =
                  s.ref.kind === "builtin"
                    ? allowedBuiltin.has(s.ref.key)
                    : allowedCustom.has(s.ref.key);
                const inputName = s.ref.kind === "builtin" ? "builtin" : "custom";
                return (
                  <label
                    key={`${s.ref.kind}-${s.ref.key}`}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-base hover:bg-canvas/60 has-[:checked]:bg-canvas"
                  >
                    <input
                      type="checkbox"
                      name={inputName}
                      value={s.ref.key}
                      defaultChecked={checked}
                      className="h-3.5 w-3.5 accent-ink"
                    />
                    <span className="text-[12.5px] text-ink">{s.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[12px] text-surface hover:bg-ink-soft transition-base"
      >
        Save changes
      </button>
    </form>
  );
}
