import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { Dropzone } from "@/components/upload/dropzone";
import { InlineTrashButton } from "@/components/upload/inline-trash";
import { Thumbnail } from "@/components/upload/thumbnail";
import { SectionsGrid } from "@/components/dashboard/sections-grid";
import {
  countUploadsBySection,
  getSignedUrlMap,
  listUploadsWithUploader,
  type UploadWithUploader,
} from "@/lib/data/uploads";
import { listAllSections } from "@/lib/data/all-sections";
import { countReviewUploads } from "@/lib/data/sections";
import { displayActor } from "@/lib/data/timeline";
import { sectionLabel } from "@/lib/sections-meta";
import { relativeTime } from "@/lib/utils";
import type { Section } from "@/lib/supabase/types";

export const metadata = { title: "Upload" };

export default async function UploadPage() {
  const [counts, uploads, allSections, reviewCount] = await Promise.all([
    countUploadsBySection(),
    listUploadsWithUploader({ limit: 50 }),
    listAllSections({ includeHidden: false, includeReview: false }),
    countReviewUploads(),
  ]);

  const thumbs = await getSignedUrlMap(
    uploads.map((u) => ({ id: u.id, storage_path: u.storage_path })),
  );

  return (
    <>
      <Topbar title="Upload" />

      <div className="space-y-10 animate-fade-up">
        <Dropzone />
        {reviewCount > 0 ? (
          <Link
            href="/dashboard/sections/review"
            className="flex items-center gap-3 rounded-xl border border-line bg-surface-raised px-4 py-3 transition-base hover:bg-canvas/60"
          >
            <p className="flex-1 text-[13px] text-ink">
              {reviewCount} {reviewCount === 1 ? "item" : "items"} need a quick review
            </p>
            <span className="text-[12px] text-ink-faint">Open</span>
          </Link>
        ) : null}
        <SectionsGrid sections={allSections} counts={counts} />
        <RecentList items={uploads} thumbs={thumbs} />
      </div>
    </>
  );
}

function RecentList({
  items,
  thumbs,
}: {
  items: UploadWithUploader[];
  thumbs: Map<string, string>;
}) {
  if (items.length === 0) {
    return (
      <section>
        <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
          Recent
        </h2>
        <p className="px-1 text-[13px] text-ink-faint">
          Anything you drop above stays here, searchable for the long run.
        </p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
        Recent
      </h2>
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li
            key={it.id}
            className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-base hover:bg-surface-raised"
          >
            <Link
              href={`/dashboard/uploads/${it.id}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <Thumbnail
                mime={it.mime_type}
                imageUrl={thumbs.get(it.id) ?? null}
                filename={it.filename}
                size={32}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] text-ink">
                  {it.title ?? it.filename}
                </p>
                <p className="truncate text-[11.5px] text-ink-faint">
                  {displayActor(it.uploader)} ·{" "}
                  {sectionLabel(it.section as Section | null)} ·{" "}
                  {relativeTime(it.created_at)}
                </p>
              </div>
            </Link>
            <InlineTrashButton uploadId={it.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}
