import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/dashboard/topbar";
import { EmptyState } from "@/components/ui/empty-state";
import { InboxIcon } from "@/components/ui/icon";
import { DropzoneCompact } from "@/components/upload/dropzone-compact";
import { UploadsPoller } from "@/components/upload/uploads-poller";
import { SectionsGrid } from "@/components/dashboard/sections-grid";
import { InboxList } from "@/components/upload/inbox-list";
import {
  countUploadsBySection,
  getSignedUrlMap,
  listUploadsWithUploader,
} from "@/lib/data/uploads";
import { listAllSections } from "@/lib/data/all-sections";
import { countReviewUploads } from "@/lib/data/sections";
import { recoverStuckUploads } from "@/lib/data/stuck-uploads";
import { Hint } from "@/components/onboarding/hint";
import { getSeenHintKeys } from "@/lib/data/onboarding";
import {
  SectionSuggestionsBanner,
  type SuggestionItem,
} from "@/components/upload/section-suggestions-banner";

export const metadata = { title: "Uploads" };

export default async function UploadPage() {
  const t = await getTranslations("empty");
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
      <Topbar title="Uploads" />
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
        {uploads.length === 0 ? (
          <EmptyState
            icon={<InboxIcon size={22} />}
            headline={t("inbox_headline")}
            description={t("inbox_desc")}
          />
        ) : (
          <InboxList items={uploads} thumbs={thumbs} />
        )}
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

// RecentList replaced by InboxList client component (adds search, lighter rows)
