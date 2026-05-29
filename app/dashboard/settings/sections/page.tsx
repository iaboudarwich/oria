import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { SectionsEditor } from "@/components/settings/sections-editor";
import { listAllSections } from "@/lib/data/all-sections";

export const metadata = { title: "Edit sections" };

/**
 * Focused section-management page reached from the sidebar's
 * "Edit sections" link. Same management surface as the embedded one
 * on /dashboard/settings. the dedicated route just gives quick access
 * without the surrounding settings groups. Add section still goes
 * through /dashboard/settings/sections/new so the AI-context form
 * (purpose, related items, etc.) keeps capturing the signal the
 * extractor uses to classify uploads later.
 */
export default async function EditSectionsPage() {
  const sections = await listAllSections({
    includeHidden: true,
    includeReview: false,
  });
  const visible = sections.filter((s) => !s.hidden).length;

  return (
    <>
      <Topbar title="Edit sections" />

      <div className="mx-auto max-w-2xl space-y-4 animate-fade-up">
        <div className="flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="text-[12.5px] text-ink-muted">
              Reorder, hide, rename or remove. Built-in sections can be
              hidden but not deleted; your custom sections can do it all.
            </p>
            <p className="mt-1 text-[11.5px] text-ink-faint">
              {visible} of {sections.length} visible.
            </p>
          </div>
          <Link
            href="/dashboard/settings/sections/new"
            className="cta inline-flex h-8 shrink-0 items-center rounded-md bg-ink px-3 text-[12px] text-surface transition-base hover:bg-ink-soft"
          >
            Add section
          </Link>
        </div>

        <SectionsEditor sections={sections} />

        <p className="px-1 pt-1 text-[11px] text-ink-faint">
          Adding a section opens a short form so Oria knows what belongs
          there: purpose, related items, file types. That context goes
          into how new uploads get classified.
        </p>
      </div>
    </>
  );
}
