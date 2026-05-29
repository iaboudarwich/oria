import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { DropzoneCompact } from "@/components/upload/dropzone-compact";
import { InlineTrashButton } from "@/components/upload/inline-trash";
import { Thumbnail } from "@/components/upload/thumbnail";
import { UploadsPoller } from "@/components/upload/uploads-poller";
import { SectionsGrid } from "@/components/dashboard/sections-grid";
import {
  countUploadsBySection,
  getSignedUrlMap,
  listUploadsWithUploader,
  type UploadWithUploader,
} from "@/lib/data/uploads";
import { listAllSections } from "@/lib/data/all-sections";
import { countReviewUploads } from "@/lib/data/sections";
import { recoverStuckUploads } from "@/lib/data/stuck-uploads";
import { displayActor } from "@/lib/data/timeline";
import { sectionLabel } from "@/lib/sections-meta";
import { relativeTime } from "@/lib/utils";
import { Hint } from "@/components/onboarding/hint";
import { getSeenHintKeys } from "@/lib/data/onboarding";
import {
  SectionSuggestionsBanner,
  type SuggestionItem,
} from "@/components/upload/section-suggestions-banner";
import type { Section } from "@/lib/supabase/types";

export const metadata = { title: "Upload" };

export default async function UploadPage() {
  // Best-effort: recover any uploads stuck in "processing" before we
  // list them, so the row either flips fast or shows a real Failed
  // pill instead of pretending it's still reading.
  await recoverStuckUploads();
  const [counts, uploads, allSections, reviewCount, seenHints] =
    await Promise.all([
      countUploadsBySection(),
      listUploadsWithUploader({ limit: 50 }),
      listAllSections({ includeHidden: false, includeReview: false }),
      countReviewUploads(),
      getSeenHintKeys(),
    ]);

  const thumbs = await getSignedUrlMap(
    uploads.map((u) => ({ id: u.id, storage_path: u.storage_path })),
  );

  const anyProcessing = uploads.some(
    (u) => u.status === "processing" || u.status === "received",
  );

  // Uploads that have a low-confidence suggestion but no section yet.
  const pendingSuggestions: SuggestionItem[] = uploads
    .filter(
      (u) =>
        !u.section &&
        !u.custom_section_id &&
        (u.auto_section || u.auto_custom_section_id),
    )
    .map((u) => ({
      id: u.id,
      title: u.title ?? u.filename,
      auto_section: u.auto_section ?? null,
      auto_custom_section_id: u.auto_custom_section_id ?? null,
    }));

  return (
    <>
      <Topbar title="Upload" />
      <UploadsPoller pending={anyProcessing} />

      <div className="space-y-7 animate-fade-up">
        <DropzoneCompact />
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
        <SectionSuggestionsBanner suggestions={pendingSuggestions} />
        <RecentList items={uploads} thumbs={thumbs} />
        <SectionsGrid sections={allSections} counts={counts} />
      </div>

      <Hint
        hintKey="take_photo_mobile"
        shouldShow={!seenHints.has("take_photo_mobile")}
        mobileOnly
        title="Snap a receipt or document"
        body="Tap the camera button in the upload area to photograph a receipt, document, or label. Oria reads it instantly."
      />
    </>
  );
}

/**
 * Quiet status pill so the user can see at a glance which uploads
 * Oria is still reading and which it finished. "Filed" is the calm
 * default, so we hide it (no badge = ready). Only "processing" and
 * "failed" surface, both as small chips that don't compete with the
 * row title.
 */
function UploadStatusPill({ status }: { status: string | null | undefined }) {
  if (status === "processing" || status === "pending") {
    return (
      <span className="ml-2 inline-flex shrink-0 items-center rounded-md bg-accent-soft/60 px-1.5 py-0.5 text-[10px] text-[#7a5a2a]">
        Reading…
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

function RecentList({
  items,
  thumbs,
}: {
  items: UploadWithUploader[];
  thumbs: Map<string, string>;
}) {
  if (items.length === 0) {
    return null;
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
              <UploadStatusPill status={it.status} />
            </Link>
            <InlineTrashButton uploadId={it.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}
