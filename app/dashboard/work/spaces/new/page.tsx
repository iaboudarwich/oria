import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/dashboard/topbar";
import { createWorkSpace } from "@/lib/data/mode-actions";
import { WORKSPACE_TEMPLATES } from "@/lib/data/workspace-templates";

export const metadata = { title: "New Workspace" };

const NAME_EXAMPLES = ["Office Building A", "Investment X", "Company Finance"];

// Starting points are described by what they set up, never by a template or
// category name. The underlying seed key stays internal (the user never sees
// it); the label and description come from the localized copy.
const STARTERS: Array<{ seedKey: string; labelKey: string; descKey: string; icon: string }> = [
  { seedKey: "business", labelKey: "ops", descKey: "ops_desc", icon: "🗂️" },
  { seedKey: "investor", labelKey: "invest", descKey: "invest_desc", icon: "📈" },
  { seedKey: "family_office", labelKey: "estate", descKey: "estate_desc", icon: "🏡" },
];

export default async function NewWorkSpacePage() {
  const t = await getTranslations("new_workspace");
  const seedSections = (key: string) =>
    WORKSPACE_TEMPLATES.find((w) => w.key === key)?.section_seeds ?? [];

  return (
    <>
      <Topbar title="New Workspace" />

      <div className="mx-auto max-w-xl animate-fade-up">
        <p className="mb-7 px-1 text-[13px] text-ink-muted">{t("intro")}</p>

        <form action={createWorkSpace} className="space-y-7">
          {/* Starting-point picker. Described by content, not by template name. */}
          <div>
            <span className="mb-2 block text-[13px] text-ink">{t("pick")}</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {STARTERS.map((s, i) => (
                <label key={s.seedKey} className="relative cursor-pointer">
                  <input
                    type="radio"
                    name="template"
                    value={s.seedKey}
                    defaultChecked={i === 0}
                    className="peer sr-only"
                  />
                  <span className="flex items-start gap-3 rounded-xl border border-line bg-canvas p-3 transition-base peer-checked:border-ink peer-checked:bg-surface-raised peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ink hover:border-line-strong">
                    <span className="mt-0.5 text-[16px]">{s.icon}</span>
                    <span>
                      <span className="block text-[12.5px] font-medium text-ink">{t(s.labelKey)}</span>
                      <span className="mt-0.5 block text-[11px] text-ink-faint">{t(s.descKey)}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {seedSections(s.seedKey).map((sec) => (
                          <span key={sec.name} className="rounded bg-line px-1.5 py-0.5 text-[10.5px] text-ink-faint">
                            {sec.name}
                          </span>
                        ))}
                      </span>
                    </span>
                  </span>
                </label>
              ))}
              {/* Blank option. */}
              <label className="relative cursor-pointer sm:col-span-2">
                <input type="radio" name="template" value="custom" className="peer sr-only" />
                <span className="flex items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-2 transition-base peer-checked:border-ink peer-checked:bg-surface-raised hover:border-line-strong">
                  <span className="text-[14px]">✨</span>
                  <span className="text-[12.5px] text-ink-muted">
                    <span className="font-medium text-ink">{t("blank")}</span> · {t("blank_desc")}
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Workspace name */}
          <div>
            <span className="mb-1.5 block text-[13px] text-ink">{t("name")}</span>
            <span className="mb-2 block text-[12px] text-ink-faint">{t("name_hint")}</span>
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
              {t("create")}
            </button>
            <Link href="/dashboard" className="text-[13px] text-ink-muted hover:text-ink transition-base">
              {t("cancel")}
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
