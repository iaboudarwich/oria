import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { createWorkSpace } from "@/lib/data/mode-actions";

export const metadata = { title: "Create work space" };

const PURPOSE_EXAMPLES = [
  "Office Building A",
  "Parking Revenue",
  "Property X",
  "Investment Y",
  "Vendor Invoices",
  "Tenant Leases",
  "Legal Documents",
  "Company Finance",
];

export default function NewWorkSpacePage() {
  return (
    <>
      <Topbar title="Create a work space" />

      <div className="mx-auto max-w-xl animate-fade-up">
        <p className="mb-7 px-1 text-[13px] text-ink-muted">
          A work space is its own operational context. One per office,
          property, investment, or company. Anything you upload here stays
          inside it.
        </p>

        <form action={createWorkSpace} className="space-y-7">
          <Field
            label="Name this work space"
            hint="A short, descriptive name. You can change it later."
          >
            <input
              type="text"
              name="name"
              required
              maxLength={60}
              placeholder="e.g. Office Building A, Property X, Investment Y"
              className="block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 text-[14px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-ink"
              autoFocus
            />
          </Field>

          <Field
            label="What is this work space for?"
            hint="A sentence or two. Helps Oria classify uploads and surface the right documents."
          >
            <textarea
              name="description"
              rows={3}
              maxLength={280}
              placeholder="Vendor invoices, tenant leases, monthly financials, contracts and so on."
              className="block w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-ink"
            />
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {PURPOSE_EXAMPLES.map((p) => (
                <li
                  key={p}
                  className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-[11px] text-ink-muted"
                >
                  {p}
                </li>
              ))}
            </ul>
          </Field>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              className="inline-flex h-11 items-center rounded-xl bg-ink px-5 text-[13.5px] text-surface hover:bg-ink-soft transition-base"
            >
              Create work space
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
