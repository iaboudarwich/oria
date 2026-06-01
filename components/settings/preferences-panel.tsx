"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  setUserPreferences,
  resetUnderstanding,
} from "@/lib/data/user-profile-actions";
import type { UserPreferences } from "@/lib/data/user-profile";

const LENGTHS: Array<UserPreferences["responseLength"]> = ["short", "medium", "long"];
const FORMALITIES: Array<UserPreferences["formality"]> = ["casual", "professional"];

/**
 * Explicit preferences form. Response length + formality steer the AI; pinned
 * metrics and focus areas tell Oria what to surface. Saving runs the server
 * action (which audits the change).
 */
export function PreferencesPanel({ initial }: { initial: UserPreferences }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [responseLength, setResponseLength] = useState(initial.responseLength);
  const [formality, setFormality] = useState(initial.formality);
  const [pinned, setPinned] = useState(initial.pinnedMetrics.join(", "));
  const [focus, setFocus] = useState(initial.focusAreas.join(", "));
  const [saved, setSaved] = useState(false);

  function save() {
    if (pending) return;
    const fd = new FormData();
    fd.set("response_length", responseLength);
    fd.set("formality", formality);
    fd.set("pinned_metrics", pinned);
    fd.set("focus_areas", focus);
    startTransition(async () => {
      await setUserPreferences(fd);
      setSaved(true);
      router.refresh();
      window.setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Preferences</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          How Oria talks to you, and what it keeps front and center.
        </p>
      </div>

      <Choice
        label="Response length"
        options={LENGTHS}
        value={responseLength}
        onChange={setResponseLength}
      />
      <Choice
        label="Tone"
        options={FORMALITIES}
        value={formality}
        onChange={setFormality}
      />

      <Field
        label="Pinned metrics"
        hint="Comma-separated. Oria highlights these in answers when relevant."
        value={pinned}
        onChange={setPinned}
        placeholder="monthly spend, lease renewals"
      />
      <Field
        label="Focus areas"
        hint="Comma-separated. Topics you care about most."
        value={focus}
        onChange={setFocus}
        placeholder="bills, travel"
      />

      <div className="flex items-center gap-4 pt-1">
        <Button variant="primary" onClick={save} disabled={pending}>
          {saved ? "Saved" : pending ? "Saving..." : "Save preferences"}
        </Button>
        <ResetButton />
      </div>
    </section>
  );
}

function ResetButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[12.5px] text-ink-faint transition-base hover:text-ink"
      >
        Reset Oria&apos;s understanding
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-[12.5px]">
      <span className="text-ink-muted">Clear what Oria has learned?</span>
      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            await resetUnderstanding();
            setConfirming(false);
            router.refresh();
          })
        }
        disabled={pending}
        className="font-medium text-claret hover:opacity-80 disabled:opacity-50"
      >
        Reset
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-ink-faint hover:text-ink"
      >
        Cancel
      </button>
    </span>
  );
}

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[12.5px] font-medium text-ink">{label}</p>
      <div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`rounded-md px-3 py-1.5 text-[12.5px] capitalize transition-base ${
              value === o ? "bg-ink text-surface" : "text-ink-muted hover:text-ink"
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-ink">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="block h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink placeholder:text-ink-faint outline-none focus:border-ink"
      />
      <span className="mt-1 block text-[11.5px] text-ink-faint">{hint}</span>
    </label>
  );
}
