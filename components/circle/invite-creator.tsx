"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  inviteToCircle,
  type EmailStatus,
} from "@/lib/data/circle-actions";
import { ArrowRightIcon } from "@/components/ui/icon";
import { InviteResultCard } from "./invite-result-card";
import { EmailStatusLine } from "./email-status-line";
import type { Invite } from "@/lib/supabase/types";

type SectionOption = {
  ref: { kind: "builtin" | "custom"; key: string };
  name: string;
};

const ACCESS_OPTIONS = [
  {
    value: "full",
    label: "Full circle access",
    blurb: "Sees everything shared with this circle.",
  },
  {
    value: "limited",
    label: "Selected sections only",
    blurb: "Sees just the sections you pick.",
  },
  {
    value: "assigned",
    label: "Assigned items only",
    blurb: "Sees only items you share with them by name.",
  },
] as const;

const TITLE_SUGGESTIONS = [
  "Husband",
  "Wife",
  "Family",
  "Sister",
  "Brother",
  "Mom",
  "Dad",
  "Roommate",
  "Driver",
  "Maid",
  "Cleaner",
  "Gardener",
  "Assistant",
];

export function InviteCreator({ sections }: { sections: SectionOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<
    { invite: Invite; emailStatus: EmailStatus } | null
  >(null);
  const [access, setAccess] = useState<"full" | "limited" | "assigned">("full");
  const [title, setTitle] = useState("");
  const [formKey, setFormKey] = useState(0); // bump to reset uncontrolled inputs

  function inviteAnother() {
    setLast(null);
    setError(null);
    setAccess("full");
    setTitle("");
    setFormKey((k) => k + 1);
  }

  if (last) {
    return (
      <div className="space-y-4">
        <EmailStatusLine
          status={last.emailStatus}
          recipient={last.invite.display_name || last.invite.email}
        />
        <InviteResultCard invite={last.invite} highlight />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={inviteAnother}
            className="inline-flex h-9 items-center rounded-lg bg-ink px-3.5 text-[12.5px] text-surface hover:bg-ink-soft transition-base"
          >
            Invite another person
          </button>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="text-[12.5px] text-ink-muted hover:text-ink transition-base"
          >
            Refresh list
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      key={formKey}
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await inviteToCircle(formData);
          if (result.ok) {
            setLast(result.data);
            router.refresh();
          } else {
            setError(result.error);
          }
        });
      }}
      className="space-y-5"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Their email">
          <input
            type="email"
            name="email"
            required
            placeholder="alex@example.com"
            className="block h-10 w-full rounded-lg border border-line-strong bg-canvas px-3 text-[13px] text-ink placeholder:text-ink-faint outline-none focus:border-ink"
          />
        </Field>
        <Field label="Display name" hint="Optional.">
          <input
            type="text"
            name="display_name"
            maxLength={80}
            placeholder="Alex"
            className="block h-10 w-full rounded-lg border border-line-strong bg-canvas px-3 text-[13px] text-ink placeholder:text-ink-faint outline-none focus:border-ink"
          />
        </Field>
      </div>

      <Field
        label="Relationship or title"
        hint="Optional. How you think of them. Pick a suggestion or type your own."
      >
        <input
          type="text"
          name="title"
          maxLength={40}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Wife, Roommate, Driver, Assistant"
          className="block h-10 w-full rounded-lg border border-line-strong bg-canvas px-3 text-[13px] text-ink placeholder:text-ink-faint outline-none focus:border-ink"
        />
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {TITLE_SUGGESTIONS.map((s) => {
            const active = title.trim().toLowerCase() === s.toLowerCase();
            return (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => setTitle(s)}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-base ${
                    active
                      ? "border-ink bg-ink text-surface"
                      : "border-line bg-canvas text-ink-muted hover:border-line-strong hover:text-ink"
                  }`}
                >
                  {s}
                </button>
              </li>
            );
          })}
        </ul>
      </Field>

      <fieldset>
        <legend className="mb-2 text-[12.5px] text-ink-muted">
          What can they see?
        </legend>
        <div className="space-y-1.5">
          {ACCESS_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-canvas/60 px-3 py-2 transition-base hover:border-line-strong has-[:checked]:border-ink has-[:checked]:bg-canvas"
            >
              <input
                type="radio"
                name="access_level"
                value={opt.value}
                checked={access === opt.value}
                onChange={() => setAccess(opt.value)}
                className="mt-0.5 h-3.5 w-3.5 accent-ink"
              />
              <span className="min-w-0">
                <span className="block text-[13px] text-ink">{opt.label}</span>
                <span className="block text-[11.5px] text-ink-faint">
                  {opt.blurb}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {access === "limited" ? (
        <fieldset>
          <legend className="mb-2 text-[12.5px] text-ink-muted">
            Which sections?
          </legend>
          {sections.length === 0 ? (
            <p className="rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[12px] text-ink-faint">
              No sections yet. Add some in Settings first.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {sections.map((s) => {
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
                      className="h-3.5 w-3.5 accent-ink"
                    />
                    <span className="text-[12.5px] text-ink">{s.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      ) : null}

      {/* Hidden role field — legacy column, defaults to "household".
          We surface relationship via the friendly `title` field instead. */}
      <input type="hidden" name="role" value="household" />

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-ink px-4 text-[13px] text-surface transition-base hover:bg-ink-soft disabled:opacity-50"
        >
          {pending ? "Creating invite" : "Create invite"}
          <ArrowRightIcon size={12} />
        </button>
        {error ? (
          <p className="text-[12.5px] text-claret">{error}</p>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] text-ink">{label}</span>
      {hint ? (
        <span className="mb-1.5 block text-[11.5px] text-ink-faint">{hint}</span>
      ) : null}
      {children}
    </label>
  );
}
