"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteToCircle, type EmailOutcome } from "@/lib/data/circle-actions";
import { ArrowRightIcon } from "@/components/ui/icon";
import { EmailStatusLine } from "./email-status-line";

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

const CIRCLE_TITLE_SUGGESTIONS = [
  "Wife",
  "Husband",
  "Family",
  "Partner",
  "Roommate",
  "Driver",
  "Cleaner",
  "Gardener",
  "Assistant",
  "Babysitter",
];

const WORKSPACE_TITLE_SUGGESTIONS = [
  "Property manager",
  "Lawyer",
  "Accountant",
  "Assistant",
  "Broker",
  "Analyst",
  "Tenant rep",
  "Vendor contact",
  "Contractor",
  "Auditor",
];

/**
 * Create-an-invite form. After a successful create we never render the
 * code/link here. that would mean the same invite appears in two places
 * (creator + list), with the risk that one card drifts out of date if
 * the user later regenerates. Instead, the form resets, a single thin
 * status line shows the email outcome with the recipient, and the new
 * invite appears auto-expanded at the top of the pending list below.
 */
export function InviteCreator({
  sections,
  orgKind = "circle",
}: {
  sections: SectionOption[];
  /** The org being invited to. Drives the title presets. a Workspace
   *  shouldn't suggest "Wife" / "Driver"; a Circle shouldn't suggest
   *  "Property manager" / "Lawyer". */
  orgKind?: "personal" | "circle" | "office";
}) {
  const router = useRouter();
  const titleSuggestions =
    orgKind === "office" ? WORKSPACE_TITLE_SUGGESTIONS : CIRCLE_TITLE_SUGGESTIONS;
  const titleFieldLabel = orgKind === "office" ? "Role or title" : "Relationship or title";
  const titlePlaceholder =
    orgKind === "office"
      ? "e.g. Property manager, Lawyer, Accountant"
      : "e.g. Wife, Roommate, Driver, Assistant";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    recipient: string;
    outcome: EmailOutcome;
  } | null>(null);
  const [access, setAccess] = useState<"full" | "limited" | "assigned">("full");
  const [title, setTitle] = useState("");
  const [formKey, setFormKey] = useState(0); // bump to reset uncontrolled inputs

  function resetForm() {
    setAccess("full");
    setTitle("");
    setFormKey((k) => k + 1);
  }

  return (
    <div className="space-y-4">
      {confirmation ? (
        <div className="rounded-xl border border-line bg-canvas/40 px-3 py-2">
          <EmailStatusLine outcome={confirmation.outcome} recipient={confirmation.recipient} />
          <p className="mt-1 text-[11.5px] text-ink-faint">
            The invite is in your list below. Open it to copy the code or link.
          </p>
        </div>
      ) : null}

      <form
        key={formKey}
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            const result = await inviteToCircle(formData);
            if (result.ok) {
              setConfirmation({
                recipient: result.data.invite.display_name || result.data.invite.email,
                outcome: result.data.emailOutcome,
              });
              resetForm();
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
              className="block h-10 w-full rounded-lg border border-line-strong bg-canvas px-3 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-ink"
            />
          </Field>
          <Field label="Display name" hint="Optional.">
            <input
              type="text"
              name="display_name"
              maxLength={80}
              placeholder="Alex"
              className="block h-10 w-full rounded-lg border border-line-strong bg-canvas px-3 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-ink"
            />
          </Field>
        </div>

        <Field label={titleFieldLabel} hint="Optional. Pick a suggestion or type your own.">
          <input
            type="text"
            name="title"
            maxLength={40}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={titlePlaceholder}
            className="block h-10 w-full rounded-lg border border-line-strong bg-canvas px-3 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-ink"
          />
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {titleSuggestions.map((s) => {
              const active = title.trim().toLowerCase() === s.toLowerCase();
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => setTitle(s)}
                    className={`transition-base cursor-pointer rounded-full border px-2.5 py-0.5 text-[11px] ${
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
          <legend className="mb-2 text-[12.5px] text-ink-muted">What can they see?</legend>
          <div className="space-y-1.5">
            {ACCESS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="transition-base flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-canvas/60 px-3 py-2 hover:border-line-strong has-[:checked]:border-ink has-[:checked]:bg-canvas"
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
                  <span className="block text-[11.5px] text-ink-faint">{opt.blurb}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {access === "limited" ? (
          <fieldset>
            <div className="mb-2 flex items-baseline gap-3">
              <legend className="text-[12.5px] text-ink-muted">Section permissions</legend>
              <span className="ml-auto text-[10.5px] text-ink-faint">Read</span>
              <span className="text-[10.5px] text-ink-faint">Write</span>
            </div>
            {sections.length === 0 ? (
              <p className="rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[12px] text-ink-faint">
                No sections yet. Add some in Settings first.
              </p>
            ) : (
              <div className="space-y-0.5">
                {sections.map((s) => {
                  const inputName = s.ref.kind === "builtin" ? "builtin" : "custom";
                  const writeKey = `can_write_${s.ref.kind}_${s.ref.key}`;
                  return (
                    <div
                      key={`${s.ref.kind}-${s.ref.key}`}
                      className="transition-base flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-canvas/60"
                    >
                      <span className="min-w-0 flex-1 text-[12.5px] text-ink">{s.name}</span>
                      {/* Read checkbox. presence of this key = read access */}
                      <input
                        type="checkbox"
                        name={inputName}
                        value={s.ref.key}
                        id={`read_${s.ref.kind}_${s.ref.key}`}
                        className="h-4 w-4 accent-ink"
                      />
                      {/* Write checkbox */}
                      <input
                        type="checkbox"
                        name={writeKey}
                        value="1"
                        id={writeKey}
                        className="h-4 w-4 accent-ink"
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-[11px] text-ink-faint">
              Read lets them see items. Write lets them upload and edit.
            </p>
          </fieldset>
        ) : null}

        {/* Hidden role field. legacy column, defaults to "household".
            We surface relationship via the friendly `title` field instead. */}
        <input type="hidden" name="role" value="household" />

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="transition-base inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-ink px-4 text-[13px] text-surface hover:bg-ink-soft disabled:cursor-default disabled:opacity-50"
          >
            {pending ? "Creating invite" : "Create invite"}
            <ArrowRightIcon size={12} />
          </button>
          {error ? <p className="text-[12.5px] text-claret">{error}</p> : null}
        </div>
      </form>
    </div>
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
      {hint ? <span className="mb-1.5 block text-[11.5px] text-ink-faint">{hint}</span> : null}
      {children}
    </label>
  );
}
