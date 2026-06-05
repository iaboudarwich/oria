"use client";

import { useState } from "react";
import Link from "next/link";
import { Thumbnail } from "@/components/upload/thumbnail";
import { InlineTrashButton } from "@/components/upload/inline-trash";
import { SearchIcon } from "@/components/ui/icon";
import { MicButton } from "@/components/ui/mic-button";
import { sectionLabel } from "@/lib/sections-meta";
import { relativeTime } from "@/lib/utils";
import { useLocale } from "next-intl";
import type { Section } from "@/lib/supabase/types";
import type { Locale } from "@/i18n/config";
import type { UploadWithUploader } from "@/lib/data/uploads";

function UploadStatusPill({ status }: { status: string | null | undefined }) {
  if (status === "processing" || status === "pending") {
    return (
      <span className="ml-2 inline-flex shrink-0 items-center rounded-md bg-accent-soft/60 px-1.5 py-0.5 text-[10px] text-[#7a5a2a]">
        Reading...
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="ml-2 inline-flex shrink-0 items-center rounded-md bg-claret/10 px-1.5 py-0.5 text-[10px] text-claret">
        Failed
      </span>
    );
  }
  return null;
}

export function InboxList({
  items,
  thumbs,
}: {
  items: UploadWithUploader[];
  thumbs: Map<string, string>;
}) {
  const [query, setQuery] = useState("");
  const locale = useLocale() as Locale;

  const filtered = query.trim()
    ? items.filter((it) => {
        const q = query.toLowerCase();
        return (
          (it.title ?? it.filename).toLowerCase().includes(q) ||
          sectionLabel(it.section as Section | null).toLowerCase().includes(q)
        );
      })
    : items;

  return (
    <section>
      {/* Search bar */}
      <div className="relative mb-4">
        <span className="absolute inset-y-0 left-3 flex items-center text-ink-faint">
          <SearchIcon size={14} />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search uploads..."
          className="block h-9 w-full rounded-xl border border-line bg-surface-raised pl-8 pr-16 text-[13.5px] text-ink placeholder:text-ink-faint outline-none focus:border-ink-soft"
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-ink-faint text-[11px] hover:text-ink"
            >
              Clear
            </button>
          )}
          <MicButton
            onTranscribed={(text) => setQuery(text)}
            targetLanguage={locale}
            size="sm"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="px-1 text-[13px] text-ink-faint">
          {query ? "No uploads match your search." : "No uploads yet."}
        </p>
      ) : (
        <ul className="space-y-0.5">
          {filtered.map((it) => (
            <li
              key={it.id}
              className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-base hover:bg-surface-raised"
            >
              <Link
                href={`/dashboard/uploads/${it.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
                onClick={(e) => {
                  // Shared-element morph: name only the row being opened, so
                  // exactly one old + one new element carry "upload-hero" during
                  // the transition. Progressive enhancement; no-op where View
                  // Transitions are unsupported.
                  const thumb = e.currentTarget.querySelector<HTMLElement>("[data-vt-thumb]");
                  if (thumb) thumb.style.viewTransitionName = "upload-hero";
                }}
              >
                <span data-vt-thumb className="inline-flex shrink-0">
                  <Thumbnail
                    mime={it.mime_type}
                    imageUrl={thumbs.get(it.id) ?? null}
                    filename={it.filename}
                    size={28}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink">
                    {it.title ?? it.filename}
                    <UploadStatusPill status={it.status} />
                  </p>
                  <p className="truncate text-[11px] text-ink-faint">
                    {sectionLabel(it.section as Section | null)}{" "}
                    · {relativeTime(it.created_at)}
                  </p>
                </div>
              </Link>
              <InlineTrashButton uploadId={it.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
