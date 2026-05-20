"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addSectionMemory,
  deleteSectionMemory,
} from "@/lib/data/section-memory-actions";
import type { SectionMemory } from "@/lib/data/section-memory";
import type { SectionScope } from "@/lib/data/section-scope";
import { CloseIcon } from "@/components/ui/icon";

/**
 * Calm panel that lists what Oria has learned about this section + lets the
 * user add or remove items. Renders nothing intrusive when empty — just a
 * single input row inviting the user to teach Oria a fact.
 *
 * Wording deliberately matches Apple Settings style: short labels, no
 * marketing copy, no confetti.
 */
export function SectionMemoryPanel({
  scope,
  memories,
}: {
  scope: SectionScope;
  memories: SectionMemory[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    const text = draft.trim();
    if (!text) return;
    const fd = new FormData();
    fd.set("scope_kind", scope.kind);
    fd.set("scope_key", scope.key);
    fd.set("scope_label", scope.label);
    fd.set("content", text);
    startTransition(async () => {
      await addSectionMemory(fd);
      setDraft("");
      router.refresh();
    });
  }

  function remove(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("scope_kind", scope.kind);
    fd.set("scope_key", scope.key);
    fd.set("scope_label", scope.label);
    startTransition(async () => {
      await deleteSectionMemory(fd);
      router.refresh();
    });
  }

  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
          What Oria remembers
        </h2>
        <span className="text-[11.5px] text-ink-faint">
          Scoped to {scope.label}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised">
        {memories.length === 0 ? (
          <p className="px-4 py-3 text-[12.5px] text-ink-faint">
            Nothing saved yet. Add a fact below and Oria will use it when
            answering questions about {scope.label}.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {memories.map((m) => (
              <li
                key={m.id}
                className="flex items-start gap-3 px-4 py-2.5"
              >
                <p className="min-w-0 flex-1 text-[13px] text-ink">
                  {m.content}
                </p>
                <button
                  type="button"
                  onClick={() => remove(m.id)}
                  disabled={pending}
                  aria-label="Forget this"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-faint transition-base hover:bg-canvas hover:text-claret disabled:opacity-50"
                >
                  <CloseIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="flex items-center gap-2 border-t border-line px-3 py-2"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Teach Oria something about ${scope.label.toLowerCase()}…`}
            maxLength={500}
            className="block h-9 flex-1 rounded-md bg-canvas/60 px-2.5 text-[13px] text-ink placeholder:text-ink-faint outline-none focus:bg-canvas"
          />
          <button
            type="submit"
            disabled={pending || draft.trim().length === 0}
            className="inline-flex h-9 items-center rounded-md bg-ink px-3 text-[12.5px] text-surface transition-base hover:bg-ink-soft disabled:opacity-50"
          >
            {pending ? "Saving" : "Save"}
          </button>
        </form>
      </div>

      <p className="mt-2 px-1 text-[11px] text-ink-faint">
        Memories stay inside this section. Oria will not use them when
        answering questions in other sections.
      </p>
    </section>
  );
}
