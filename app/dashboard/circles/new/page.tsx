import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { createCircle } from "@/lib/data/space-actions";

export const metadata = { title: "Create circle" };

const PURPOSE_EXAMPLES = [
  "Shared household coordination",
  "Apartment bills and reminders",
  "Family travel and documents",
  "Shared errands and planning",
];

export default function NewCirclePage() {
  return (
    <>
      <Topbar title="Create a circle" />

      <div className="animate-fade-up mx-auto max-w-xl">
        <Steps current={1} />

        <p className="mt-5 mb-7 px-1 text-[13px] text-ink-muted">
          A circle is a small, trusted group. Family, partner, roommates, an assistant. Anything you
          share here stays inside the circle. Your personal space never leaks in.
        </p>

        <form action={createCircle} className="space-y-7">
          <Field label="Name this circle" hint="A short, human name. You can change it later.">
            <input
              type="text"
              name="name"
              required
              maxLength={60}
              placeholder="e.g. Family, Roommates, Mom & Dad, Travel Group"
              className="transition-base block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 text-[16px] text-ink outline-none placeholder:text-ink-faint focus:border-ink"
              autoFocus
            />
          </Field>

          <Field
            label="What is this circle for?"
            hint="A sentence or two. Oria uses this to file uploads, organize reminders, and surface the right memory."
          >
            <textarea
              name="description"
              rows={3}
              maxLength={280}
              placeholder={PURPOSE_EXAMPLES.join("  ·  ")}
              className="transition-base block w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 py-2.5 text-[16px] text-ink outline-none placeholder:text-ink-faint focus:border-ink"
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
              className="transition-base inline-flex h-11 items-center rounded-xl bg-ink px-5 text-[13.5px] text-surface hover:bg-ink-soft"
            >
              Continue
            </button>
            <Link
              href="/dashboard"
              className="transition-base text-[13px] text-ink-muted hover:text-ink"
            >
              Cancel
            </Link>
          </div>
        </form>
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
            {i < labels.length - 1 ? <span className="ml-1 h-px w-6 bg-line" /> : null}
          </li>
        );
      })}
    </ol>
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
      {hint ? <span className="mb-2 block text-[12px] text-ink-faint">{hint}</span> : null}
      {children}
    </label>
  );
}
