"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { SectionsEditor as SectionsEditorType } from "./sections-editor";

/**
 * Defers the SectionsEditor chunk (and its @dnd-kit/core + sortable +
 * utilities transitive deps) until it actually mounts. On
 * /dashboard/settings the editor is inside the "Sections" tab. below
 * the fold when the page opens on the default "General" tab. so the
 * dnd-kit weight doesn't need to be in the synchronous bundle.
 *
 * ssr:false is appropriate here: @dnd-kit binds to browser pointer
 * events at construction time and there's nothing to render on the
 * server. The skeleton fallback preserves layout while the chunk
 * streams in.
 *
 * The dedicated /dashboard/settings/sections route keeps importing
 * SectionsEditor directly. the editor IS the page there, so deferral
 * would just add latency without saving anything.
 */
const SectionsEditorClient = dynamic(
  () => import("./sections-editor").then((m) => m.SectionsEditor),
  {
    ssr: false,
    loading: () => <SectionsEditorSkeleton />,
  },
);

export function SectionsEditorLazy(
  props: ComponentProps<typeof SectionsEditorType>,
) {
  return <SectionsEditorClient {...props} />;
}

/** Layout-stable placeholder while the editor chunk loads. Renders a
 *  few neutral rows that approximate the editor's typical height so
 *  the page doesn't reflow when the real component mounts. */
function SectionsEditorSkeleton() {
  return (
    <ul
      aria-hidden
      className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-[0_1px_2px_rgba(28,26,23,0.04),0_2px_8px_-6px_rgba(28,26,23,0.08)]"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-center gap-2 px-2 py-2">
          <span className="inline-block h-7 w-7 rounded-md bg-canvas" />
          <span className="inline-block h-7 w-7 rounded-md bg-canvas" />
          <span className="block h-3 flex-1 rounded skeleton" />
        </li>
      ))}
    </ul>
  );
}
