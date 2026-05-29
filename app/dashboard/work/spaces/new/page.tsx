import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { createWorkSpace } from "@/lib/data/mode-actions";
import { WORKSPACE_TEMPLATES } from "@/lib/data/workspace-templates";

export const metadata = { title: "New Workspace" };

const NAME_EXAMPLES = [
  "Office Building A",
  "Investment X",
  "Company Finance",
];

export default function NewWorkSpacePage() {
  const mainTemplates = WORKSPACE_TEMPLATES.filter((t) => t.key !== "custom");

  return (
    <>
      <Topbar title="New Workspace" />

      <div className="mx-auto max-w-xl animate-fade-up">
        <p className="mb-7 px-1 text-[13px] text-ink-muted">
          A Workspace is its own operational context. Pick a template to
          seed it with the right sections, then name it.
        </p>

        <form action={createWorkSpace} className="space-y-7">

          {/* Template picker */}
          <div>
            <span className="mb-2 block text-[13px] text-ink">
              Start from a template
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              {mainTemplates.map((t, i) => (
                <label key={t.key} className="relative cursor-pointer">
                  <input
                    type="radio"
                    name="template"
                    value={t.key}
                    defaultChecked={i === 0}
                    className="peer sr-only"
                  />
                  <span className="flex items-start gap-3 rounded-xl border border-line bg-canvas p-3 transition-base peer-checked:border-ink peer-checked:bg-surface-raised peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ink hover:border-line-strong">
                    <span className="mt-0.5 text-[16px]">{templateEmoji(t.key)}</span>
                    <span>
                      <span className="block text-[12.5px] font-medium text-ink">{t.label}</span>
                      <span className="mt-0.5 block text-[11px] text-ink-faint">{t.description}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {t.section_seeds.map((s) => (
                          <span key={s.name} className="rounded bg-line px-1.5 py-0.5 text-[10.5px] text-ink-faint">{s.name}</span>
                        ))}
                      </span>
                    </span>
                  </span>
                </label>
              ))}
              {/* Custom / blank option */}
              <label className="relative cursor-pointer sm:col-span-2">
                <input
                  type="radio"
                  name="template"
                  value="custom"
                  className="peer sr-only"
                />
                <span className="flex items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-2 transition-base peer-checked:border-ink peer-checked:bg-surface-raised hover:border-line-strong">
                  <span className="text-[14px]">✨</span>
                  <span className="text-[12.5px] text-ink-muted">Blank. No sections, start from scratch.</span>
                </span>
              </label>
            </div>
          </div>

          {/* Workspace name */}
          <div>
            <span className="mb-1.5 block text-[13px] text-ink">Workspace name</span>
            <span className="mb-2 block text-[12px] text-ink-faint">A short, descriptive name. You can change it later.</span>
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
                <li key={p} className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-[11px] text-ink-muted">
                  {p}
                </li>
              ))}
            </ul>
          </div>

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

function templateEmoji(key: string): string {
  switch (key) {
    case "personal":      return "🏠";
    case "investor":      return "📈";
    case "business":      return "🏢";
    case "family_office": return "🏛️";
    default:              return "✨";
  }
}
