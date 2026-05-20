import Link from "next/link";
import { SECTION_META, CustomSectionIcon } from "@/lib/sections-meta";
import type { MergedSection } from "@/lib/data/all-sections";
import type { Section } from "@/lib/supabase/types";

type Props = {
  sections: MergedSection[];
  counts: Record<Section, number>;
  showManage?: boolean;
};

/**
 * Single shared sections grid used by the home and upload pages.
 * Built-in sections show their item count; custom sections show only the name.
 */
export function SectionsGrid({ sections, counts, showManage = true }: Props) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[13px] font-medium text-ink-muted">Sections</h2>
        {showManage ? (
          <Link
            href="/dashboard/settings"
            className="text-[12px] text-ink-faint hover:text-ink transition-base"
          >
            Manage
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {sections.map((s) => {
          const isBuiltin = s.ref.kind === "builtin";
          const Icon = isBuiltin
            ? SECTION_META[s.ref.key as Section].Icon
            : CustomSectionIcon;
          const count = isBuiltin ? counts[s.ref.key as Section] ?? 0 : undefined;
          return (
            <Link
              key={`${s.ref.kind}-${s.ref.key}`}
              href={s.href}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-base hover:bg-surface-raised"
            >
              <Icon size={14} />
              <span className="flex-1 truncate text-[13px] text-ink">
                {s.name}
              </span>
              {typeof count === "number" ? (
                <span className="text-[11px] text-ink-faint">{count}</span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
