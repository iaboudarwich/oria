import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { DropzoneCompact } from "@/components/upload/dropzone-compact";
import { Thumbnail } from "@/components/upload/thumbnail";
import { SearchHero } from "@/components/dashboard/search-hero";
import { TodayPulse } from "@/components/dashboard/today-pulse";
import { SectionsGrid } from "@/components/dashboard/sections-grid";
import { getCurrentContext } from "@/lib/data/organizations";
import {
  countUploadsBySection,
  getSignedUrlMap,
  listUploadsWithUploader,
  type UploadWithUploader,
} from "@/lib/data/uploads";
import { listAllSections } from "@/lib/data/all-sections";
import { displayActor } from "@/lib/data/timeline";
import { sectionLabel } from "@/lib/sections-meta";
import { relativeTime } from "@/lib/utils";
import type { Section } from "@/lib/supabase/types";

export default async function DashboardHome() {
  const ctx = await getCurrentContext();
  const greeting = ctx?.profile.full_name
    ? `Hi, ${ctx.profile.full_name.split(" ")[0]}`
    : "Hi";

  const [uploads, sectionCounts, allSections] = await Promise.all([
    listUploadsWithUploader({ limit: 4 }),
    countUploadsBySection(),
    listAllSections({ includeHidden: false, includeReview: false }),
  ]);

  const thumbs = await getSignedUrlMap(
    uploads.map((u) => ({ id: u.id, storage_path: u.storage_path })),
  );

  const isEmpty = uploads.length === 0;

  return (
    <>
      <Topbar title={greeting} />

      <div className="space-y-7 animate-fade-up">
        <SearchHero />

        <AddRow />

        <TodayPulse activeSpaceId={ctx?.organization.id ?? ""} />

        {isEmpty ? (
          <Onboarding />
        ) : (
          <Recent uploads={uploads} thumbs={thumbs} />
        )}

        <SectionsGrid sections={allSections} counts={sectionCounts} />
      </div>
    </>
  );
}

function AddRow() {
  return <DropzoneCompact />;
}

function Onboarding() {
  return (
    <p className="px-1 text-[13px] text-ink-faint">
      Anything you drop above stays here. Sections fill in automatically.
    </p>
  );
}

function Recent({
  uploads,
  thumbs,
}: {
  uploads: UploadWithUploader[];
  thumbs: Map<string, string>;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[13px] font-medium text-ink-muted">Recent</h2>
        <Link
          href="/dashboard/timeline"
          className="text-[12px] text-ink-faint hover:text-ink transition-base"
        >
          Timeline
        </Link>
      </div>
      <ul className="space-y-0.5">
        {uploads.map((u) => (
          <li key={u.id}>
            <Link
              href={`/dashboard/uploads/${u.id}`}
              className="flex items-center gap-3 rounded-lg px-3 py-2 transition-base hover:bg-surface-raised"
            >
              <Thumbnail
                mime={u.mime_type}
                imageUrl={thumbs.get(u.id) ?? null}
                filename={u.filename}
                size={32}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] text-ink">
                  {u.title ?? u.filename}
                </p>
                <p className="truncate text-[11.5px] text-ink-faint">
                  {displayActor(u.uploader)} ·{" "}
                  {sectionLabel(u.section as Section | null)} ·{" "}
                  {relativeTime(u.created_at)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
