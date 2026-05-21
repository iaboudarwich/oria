import Link from "next/link";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EyeIcon,
  EyeOffIcon,
} from "@/components/ui/icon";
import { SECTION_META, CustomSectionIcon } from "@/lib/sections-meta";
import { deleteCustomSection } from "@/lib/data/custom-section-actions";
import {
  moveSection,
  toggleSectionHidden,
} from "@/lib/data/section-settings-actions";
import type { MergedSection } from "@/lib/data/all-sections";
import type { Section } from "@/lib/supabase/types";

/**
 * Section management list, rendered both in /dashboard/settings and on
 * the focused /dashboard/settings/sections page (the latter is what the
 * sidebar "Edit sections" link opens). All actions are server actions
 * — reorder, hide/show, delete custom — so no client JS needed here.
 *
 * Built-in sections can be reordered + hidden but never renamed or
 * deleted; those names are product vocabulary. Custom sections have
 * Edit (rename + AI context) and Remove on top.
 */
export function SectionsEditor({ sections }: { sections: MergedSection[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-[0_1px_2px_rgba(28,26,23,0.04),0_2px_8px_-6px_rgba(28,26,23,0.08)]">
      {sections.map((s, i) => (
        <SectionRow
          key={`${s.ref.kind}-${s.ref.key}`}
          section={s}
          isFirst={i === 0}
          isLast={i === sections.length - 1}
        />
      ))}
    </ul>
  );
}

function SectionRow({
  section,
  isFirst,
  isLast,
}: {
  section: MergedSection;
  isFirst: boolean;
  isLast: boolean;
}) {
  const Icon =
    section.ref.kind === "builtin"
      ? SECTION_META[section.ref.key as Section].Icon
      : CustomSectionIcon;
  const isCustom = section.ref.kind === "custom";

  return (
    <li
      className={`flex items-center gap-2 px-2 py-2 transition-base hover:bg-canvas/60 ${
        section.hidden ? "opacity-55" : ""
      }`}
    >
      <MoveButton target={section.ref} dir="up" disabled={isFirst} />
      <MoveButton target={section.ref} dir="down" disabled={isLast} />

      <span className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center text-ink-muted">
        <Icon size={14} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] text-ink">{section.name}</p>
        <p className="text-[11.5px] text-ink-faint">
          {section.ref.kind === "builtin" ? "Built in" : "Custom"}
          {section.hidden ? " · hidden" : ""}
        </p>
      </div>

      <HideButton target={section.ref} hidden={section.hidden} />

      {isCustom ? (
        <>
          <Link
            href={`/dashboard/settings/sections/${section.ref.key}/edit`}
            className="text-[11.5px] text-ink-muted hover:text-ink transition-base"
          >
            Edit
          </Link>
          <form action={deleteCustomSection}>
            <input type="hidden" name="id" value={section.ref.key} />
            <button
              type="submit"
              className="text-[11.5px] text-ink-faint hover:text-claret transition-base"
            >
              Remove
            </button>
          </form>
        </>
      ) : null}
    </li>
  );
}

function MoveButton({
  target,
  dir,
  disabled,
}: {
  target: { kind: string; key: string };
  dir: "up" | "down";
  disabled: boolean;
}) {
  return (
    <form action={moveSection}>
      <input type="hidden" name="kind" value={target.kind} />
      <input type="hidden" name="key" value={target.key} />
      <input type="hidden" name="dir" value={dir} />
      <button
        type="submit"
        disabled={disabled}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-base hover:bg-canvas hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
        aria-label={dir === "up" ? "Move up" : "Move down"}
      >
        {dir === "up" ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
      </button>
    </form>
  );
}

function HideButton({
  target,
  hidden,
}: {
  target: { kind: string; key: string };
  hidden: boolean;
}) {
  return (
    <form action={toggleSectionHidden}>
      <input type="hidden" name="kind" value={target.kind} />
      <input type="hidden" name="key" value={target.key} />
      <button
        type="submit"
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] text-ink-muted transition-base hover:bg-canvas hover:text-ink"
        aria-label={hidden ? "Show section" : "Hide section"}
      >
        {hidden ? <EyeIcon size={12} /> : <EyeOffIcon size={12} />}
        {hidden ? "Show" : "Hide"}
      </button>
    </form>
  );
}
