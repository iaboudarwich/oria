import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { createWorkSpace } from "@/lib/data/mode-actions";

export const metadata = { title: "New Workspace" };

const PURPOSES = [
  "Business",
  "Property",
  "Investment",
  "Company",
  "Project",
  "Other",
];

const STORE_TYPES = [
  "Invoices",
  "Leases",
  "Rent",
  "Expenses",
  "Contracts",
  "Reports",
];

const NAME_EXAMPLES = [
  "Office Building A",
  "Investment X",
  "Company Finance",
];

export default function NewWorkSpacePage() {
  return (
    <>
      <Topbar title="New Workspace" />

      <div className="mx-auto max-w-xl animate-fade-up">
        <p className="mb-7 px-1 text-[13px] text-ink-muted">
          A Workspace is its own operational context — one per office,
          property, investment, or company. Your private Work area already
          exists; this form is for adding another scoped Workspace on top.
        </p>

        <form action={createWorkSpace} className="space-y-7">
          <Field
            label="What is this Workspace for?"
            hint="Pick the closest fit. This helps Oria tune extraction and summaries for the Workspace."
          >
            <ChipRadio name="purpose" options={PURPOSES} defaultIndex={0} />
          </Field>

          <Field
            label="Workspace name"
            hint="A short, descriptive name. You can change it later."
          >
            <input
              type="text"
              name="name"
              required
              maxLength={60}
              placeholder={NAME_EXAMPLES[0]}
              className="block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 text-[16px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-ink"
              autoFocus
            />
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {NAME_EXAMPLES.map((p) => (
                <li
                  key={p}
                  className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-[11px] text-ink-muted"
                >
                  {p}
                </li>
              ))}
            </ul>
          </Field>

          <Field
            label="What will you store here?"
            hint="Pick any that fit. You can always upload other things later."
          >
            <ChipCheckbox name="stores" options={STORE_TYPES} />
          </Field>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              className="inline-flex h-11 items-center rounded-xl bg-ink px-5 text-[13.5px] text-surface hover:bg-ink-soft transition-base"
            >
              Create Workspace
            </button>
            <Link
              href="/dashboard"
              className="text-[13px] text-ink-muted hover:text-ink transition-base"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </>
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
      <span className="mb-1.5 block text-[13px] text-ink">{label}</span>
      {hint ? (
        <span className="mb-2 block text-[12px] text-ink-faint">{hint}</span>
      ) : null}
      {children}
    </label>
  );
}

function ChipRadio({
  name,
  options,
  defaultIndex = 0,
}: {
  name: string;
  options: string[];
  defaultIndex?: number;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt, i) => (
        <label key={opt} className="relative cursor-pointer">
          <input
            type="radio"
            name={name}
            value={opt}
            defaultChecked={i === defaultIndex}
            className="peer sr-only"
          />
          <span className="inline-flex items-center rounded-full border border-line bg-canvas px-3 py-1 text-[12.5px] text-ink-muted transition-base hover:border-line-strong peer-checked:border-ink peer-checked:bg-ink peer-checked:text-surface peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ink">
            {opt}
          </span>
        </label>
      ))}
    </div>
  );
}

function ChipCheckbox({
  name,
  options,
}: {
  name: string;
  options: string[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <label key={opt} className="relative cursor-pointer">
          <input
            type="checkbox"
            name={name}
            value={opt}
            className="peer sr-only"
          />
          <span className="inline-flex items-center rounded-full border border-line bg-canvas px-3 py-1 text-[12.5px] text-ink-muted transition-base hover:border-line-strong peer-checked:border-ink peer-checked:bg-ink peer-checked:text-surface peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ink">
            {opt}
          </span>
        </label>
      ))}
    </div>
  );
}
