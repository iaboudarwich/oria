import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { createCustomSection } from "@/lib/data/custom-section-actions";

export const metadata = { title: "New section" };

const KIND_OPTIONS = [
  "documents",
  "receipts",
  "notes",
  "travel",
  "schoolwork",
  "contracts",
  "photos",
  "reminders",
];

const MODE_OPTIONS: { value: string; label: string }[] = [
  { value: "personal", label: "Personal" },
  { value: "shared", label: "Shared" },
  { value: "work", label: "Work" },
  { value: "family", label: "Family" },
  { value: "archive", label: "Long-term archive" },
  { value: "active", label: "Active, daily use" },
];

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "reminders", label: "Reminders & tasks" },
  { value: "search", label: "Searchability" },
  { value: "storage", label: "Document storage" },
  { value: "collaboration", label: "Collaboration" },
  { value: "timeline", label: "Timeline organization" },
];

export default function NewSectionPage() {
  return (
    <>
      <Topbar title="New section" />

      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/dashboard/settings"
          className="transition-base inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-ink-muted hover:bg-surface-raised hover:text-ink"
        >
          <span className="-ml-0.5">←</span> Settings
        </Link>
      </div>

      <p className="mb-8 max-w-xl px-1 text-[13px] text-ink-muted">
        A few quick taps help Oria place uploads into the right place later. All of these are
        optional.
      </p>

      <form action={createCustomSection} className="animate-fade-up max-w-xl space-y-8">
        <Field label="Name">
          <input
            type="text"
            name="name"
            required
            maxLength={60}
            placeholder="e.g. Taxes, School, Pets, Work"
            className="transition-base block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 text-[16px] text-ink outline-none placeholder:text-ink-faint focus:border-ink"
          />
        </Field>

        <Question label="What kinds of things will live here?" hint="Pick a few.">
          <div className="-mx-1 flex flex-wrap gap-1.5">
            {KIND_OPTIONS.map((k) => (
              <label key={k} className="cursor-pointer">
                <input type="checkbox" name="kinds" value={k} className="peer sr-only" />
                <span className="transition-base inline-flex items-center rounded-lg border border-line bg-surface-raised px-3 py-1.5 text-[12.5px] text-ink-muted select-none peer-checked:border-ink peer-checked:bg-ink peer-checked:text-surface hover:border-line-strong hover:text-ink">
                  {k}
                </span>
              </label>
            ))}
          </div>
        </Question>

        <Question label="Is this section mostly..." hint="Pick one.">
          <RadioGroup name="mode" options={MODE_OPTIONS} />
        </Question>

        <Question label="What should uploads here be best at?" hint="Pick one.">
          <RadioGroup name="priority" options={PRIORITY_OPTIONS} />
        </Question>

        <Question label="People, companies, or topics here?" hint="Comma-separated, optional.">
          <input
            type="text"
            name="related"
            maxLength={280}
            placeholder="e.g. Acme Corp, Jane Smith, taxes"
            className="transition-base block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 text-[16px] text-ink outline-none placeholder:text-ink-faint focus:border-ink"
          />
        </Question>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="transition-base inline-flex h-11 items-center rounded-xl bg-ink px-5 text-[13.5px] text-surface hover:bg-ink-soft"
          >
            Create section
          </button>
          <Link
            href="/dashboard/settings"
            className="transition-base text-[13px] text-ink-muted hover:text-ink"
          >
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function Question({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-[13.5px] text-ink">{label}</p>
      {hint ? <p className="mb-3 text-[11.5px] text-ink-faint">{hint}</p> : null}
      {children}
    </div>
  );
}

function RadioGroup({
  name,
  options,
}: {
  name: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="-mx-1 flex flex-wrap gap-1.5">
      {options.map((o) => (
        <label key={o.value} className="cursor-pointer">
          <input type="radio" name={name} value={o.value} className="peer sr-only" />
          <span className="transition-base inline-flex items-center rounded-lg border border-line bg-surface-raised px-3 py-1.5 text-[12.5px] text-ink-muted select-none peer-checked:border-ink peer-checked:bg-ink peer-checked:text-surface hover:border-line-strong hover:text-ink">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}
