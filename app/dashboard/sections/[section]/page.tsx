import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/dashboard/topbar";
import { EmptyState } from "@/components/ui/empty-state";
import { DropzoneCompact } from "@/components/upload/dropzone-compact";
import { TextLogForm } from "@/components/section/text-log-form";
import { Thumbnail } from "@/components/upload/thumbnail";
import { SparkIcon } from "@/components/ui/icon";
import {
  getSignedUrlMap,
  type UploadWithUploader,
} from "@/lib/data/uploads";
import {
  listReviewUploads,
  listSectionEntries,
  type SectionEntry,
} from "@/lib/data/sections";
import { getCustomSectionById } from "@/lib/data/custom-sections";
import { listAllSections } from "@/lib/data/all-sections";
import { displayActor } from "@/lib/data/timeline";
import { relativeTime } from "@/lib/utils";
import { MovePicker } from "@/components/upload/move-picker";
import { InlineTrashButton } from "@/components/upload/inline-trash";
import { SECTION_META } from "@/lib/sections-meta";
import { requireContext } from "@/lib/data/organizations";
import { summaryForSection } from "@/lib/sections/summaries";
import { SectionSummaryCard } from "@/components/sections/section-summary-card";
import { SectionViewTabs } from "@/components/sections/section-view-tabs";
import { TripsView } from "@/components/sections/trips-view";
import { HealthTimelineView } from "@/components/sections/health-timeline-view";
import { recordBehaviorSignal } from "@/lib/data/behavior-signals";
import { listCloudFilesForSection } from "@/lib/google/cloud-files";
import { listCloudConnectionsByService } from "@/lib/google/cloud-connections";
import { LinkedFilesPanel } from "@/components/cloud/linked-files-panel";
import type { LinkedFile } from "@/components/cloud/linked-files-list";
import type { Section } from "@/lib/supabase/types";

/** Linked Drive files + whether a Drive account is connected, fetched together
 *  so the section page can run this parallel to its entry fetch. */
async function loadLinkedFiles(
  userId: string,
  orgId: string,
  sectionKey: string,
): Promise<{ files: LinkedFile[]; driveConnected: boolean }> {
  const [files, driveConns] = await Promise.all([
    listCloudFilesForSection(userId, orgId, sectionKey),
    listCloudConnectionsByService(userId, "drive"),
  ]);
  return { files, driveConnected: driveConns.length > 0 };
}

type MoveOption = {
  ref: { kind: "builtin" | "custom" | "review"; key: string };
  name: string;
};

const BUILTIN_SECTIONS: Section[] = [
  "household", "travel", "properties", "staff", "events",
  "finance", "legal", "personal", "vendors", "health",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  params: Promise<{ section: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SectionPage({ params, searchParams }: Props) {
  const { section } = await params;
  const sp: Record<string, string | string[] | undefined> = await (
    searchParams ?? Promise.resolve({})
  );
  const view = typeof sp.view === "string" ? sp.view : "files";
  const htype = typeof sp.htype === "string" ? sp.htype : undefined;
  const t = await getTranslations("empty");

  // Special: "review". uploads Oria couldn't confidently classify.
  if (section === "review") {
    const [uploads, allSections] = await Promise.all([
      listReviewUploads(100),
      listAllSections({ includeHidden: false, includeReview: false }),
    ]);
    const thumbs = await getSignedUrlMap(
      uploads.map((u) => ({ id: u.id, storage_path: u.storage_path })),
    );
    const moveOptions: MoveOption[] = allSections.map((s) => ({
      ref: { kind: s.ref.kind, key: s.ref.key } as const,
      name: s.name,
    }));
    return (
      <Layout
        title="Unsorted"
        count={uploads.length}
        dropzoneNode={null}
      >
        {uploads.length === 0 ? (
          <p className="px-1 text-[13px] text-ink-faint">
            All caught up.
          </p>
        ) : (
          <UploadList items={uploads} thumbs={thumbs} moveOptions={moveOptions} />
        )}
      </Layout>
    );
  }

  const ctx = await requireContext();
  const orgId = ctx.organization.id;

  // Behavior signal: section visited. Fire-and-forget, never awaited.
  void recordBehaviorSignal({
    userId: ctx.profile.id,
    organizationId: orgId,
    type: "section_visited",
    value: { section_key: section },
  });

  // Custom section by UUID.
  if (UUID_RE.test(section)) {
    const custom = await getCustomSectionById(section);
    if (!custom) notFound();
    // Summary generation runs parallel to the entry fetch so it never adds
    // to TTFB (perf rule).
    const [entries, summary, linked] = await Promise.all([
      listSectionEntries({ kind: "custom", key: custom.id }, 100),
      summaryForSection({ kind: "custom", key: custom.id }, orgId),
      loadLinkedFiles(ctx.profile.id, orgId, custom.id),
    ]);
    const thumbs = await thumbsForEntries(entries);
    return (
      <Layout
        title={custom.name}
        count={entries.length}
        summaryNode={
          entries.length > 0 && summary ? (
            <SectionSummaryCard data={summary} />
          ) : null
        }
        linkedFilesNode={
          <LinkedFilesPanel
            organizationId={orgId}
            sectionKey={custom.id}
            files={linked.files}
            driveConnected={linked.driveConnected}
          />
        }
        dropzoneNode={
          <DropzoneCompact
            defaultCustomSectionId={custom.id}
            heading={`Drop into ${custom.name}`}
            subheading="or click to add"
          />
        }
        textLogNode={
          <TextLogForm
            customSectionId={custom.id}
            customSectionName={custom.name}
            placeholder={`Type a note for ${custom.name}…`}
            label="Or log by text"
          />
        }
      >
        {entries.length === 0 ? (
          <EmptyState compact headline={t("section_headline", { name: custom.name })} />
        ) : (
          <EntryList entries={entries} thumbs={thumbs} />
        )}
      </Layout>
    );
  }

  // Built-in section.
  if (!BUILTIN_SECTIONS.includes(section as Section)) notFound();
  const sec = section as Section;
  const meta = SECTION_META[sec];

  const [entries, summary, linked] = await Promise.all([
    listSectionEntries({ kind: "builtin", key: sec }, 100),
    summaryForSection({ kind: "builtin", key: sec }, orgId),
    loadLinkedFiles(ctx.profile.id, orgId, sec),
  ]);
  const thumbs = await thumbsForEntries(entries);

  // Intelligence view: Travel gets a Trips tab, Health a Timeline tab.
  const intel =
    sec === "travel" ? "trips" : sec === "health" ? "timeline" : null;
  const activeView = intel && view === intel ? intel : "files";
  const viewTabs = intel
    ? [
        { key: "files", label: "Files", href: `/dashboard/sections/${sec}` },
        {
          key: intel,
          label: intel === "trips" ? "Trips" : "Timeline",
          href: `/dashboard/sections/${sec}?view=${intel}`,
        },
      ]
    : null;

  return (
    <Layout
      title={meta.label}
      count={entries.length}
      summaryNode={
        entries.length > 0 && summary ? (
          <SectionSummaryCard data={summary} />
        ) : null
      }
      linkedFilesNode={
        <LinkedFilesPanel
          organizationId={orgId}
          sectionKey={sec}
          files={linked.files}
          driveConnected={linked.driveConnected}
        />
      }
      dropzoneNode={
        <DropzoneCompact
          defaultSection={sec}
          heading={`Drop into ${meta.label}`}
          subheading="or click to add"
        />
      }
      textLogNode={
        <TextLogForm
          section={sec}
          placeholder={placeholderForSection(sec)}
          label="Or log by text"
        />
      }
      viewTabsNode={
        viewTabs ? <SectionViewTabs active={activeView} tabs={viewTabs} /> : null
      }
    >
      {activeView === "trips" ? (
        <TripsView orgId={orgId} />
      ) : activeView === "timeline" ? (
        <HealthTimelineView orgId={orgId} filter={htype} />
      ) : entries.length === 0 ? (
        <EmptyState compact headline={t("section_headline", { name: meta.label })} />
      ) : (
        <EntryList entries={entries} thumbs={thumbs} />
      )}
    </Layout>
  );
}

/**
 * Section-specific placeholder. Nudges the user toward the right kind
 * of detail without spelling out a schema. Falls back to a generic
 * line for sections we haven't tuned.
 */
function placeholderForSection(sec: Section): string {
  switch (sec) {
    case "travel":
      return "e.g. ‘Flight to Paris July 6 at 8pm, Air France AF331’";
    case "finance":
      return "e.g. ‘Spent $500 at Chanel yesterday’";
    case "legal":
      return "e.g. ‘Lease for 14 Pine St expires August 30, $3,200/month’";
    case "health":
      return "e.g. ‘Dr Patel follow-up June 12 at 10am’";
    case "household":
      return "e.g. ‘Plumber Tuesday 9am, $180 estimate’";
    case "vendors":
      return "e.g. ‘Hired Acme HVAC, contract through March 2027’";
    case "properties":
      return "e.g. ‘Unit 4B occupied. Sarah Chen, lease through Dec 2026’";
    case "staff":
      return "e.g. ‘Hired Maria as housekeeper, starts June 1, $25/hr’";
    case "events":
      return "e.g. ‘Anniversary dinner June 14, Beirut, table for 4’";
    case "personal":
      return "e.g. ‘Call Mom Sunday at 4pm’";
    default:
      return "Type a quick note to log into this section.";
  }
}

/** Fetch signed thumbnail URLs keyed by entry id. Both uploads and items
 *  show the parent file's thumb. items don't have storage of their own. */
async function thumbsForEntries(
  entries: SectionEntry[],
): Promise<Map<string, string>> {
  const seen = new Set<string>();
  const list: Array<{ id: string; storage_path: string }> = [];
  for (const e of entries) {
    if (!e.storage_path || seen.has(e.id)) continue;
    list.push({ id: e.id, storage_path: e.storage_path });
    seen.add(e.id);
  }
  return getSignedUrlMap(list);
}

function Layout({
  title,
  count,
  dropzoneNode,
  textLogNode = null,
  summaryNode = null,
  viewTabsNode = null,
  linkedFilesNode = null,
  children,
}: {
  title: string;
  count: number;
  dropzoneNode: React.ReactNode;
  textLogNode?: React.ReactNode;
  summaryNode?: React.ReactNode;
  viewTabsNode?: React.ReactNode;
  linkedFilesNode?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <Topbar title={title} />

      <div className="mb-5 flex items-center gap-2 px-1">
        <Link
          href="/dashboard"
          className="text-[12px] text-ink-faint hover:text-ink transition-base"
        >
          ← Home
        </Link>
        <span className="ml-auto text-[12px] text-ink-faint">
          {count} {count === 1 ? "item" : "items"}
        </span>
      </div>

      {summaryNode}

      {dropzoneNode ? <div className="mb-6">{dropzoneNode}</div> : null}
      {textLogNode ? <div className="mb-6">{textLogNode}</div> : null}

      {viewTabsNode ? <div className="mb-4">{viewTabsNode}</div> : null}

      {linkedFilesNode ? <div className="mb-6">{linkedFilesNode}</div> : null}

      <div className="animate-fade-up">{children}</div>
    </>
  );
}

function UploadList({
  items,
  thumbs,
  moveOptions,
}: {
  items: UploadWithUploader[];
  thumbs: Map<string, string>;
  moveOptions?: MoveOption[];
}) {
  return (
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
                {displayActor(it.uploader)} · {relativeTime(it.created_at)}
              </p>
            </div>
            {it.document_type === "unknown" ? (
              <SparkIcon size={12} />
            ) : null}
          </Link>
          {moveOptions ? (
            <div className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
              <MovePicker
                uploadId={it.id}
                currentRef={{ kind: "review", key: "review" }}
                sections={moveOptions}
                variant="inline-quiet"
              />
            </div>
          ) : null}
          <InlineTrashButton uploadId={it.id} />
        </li>
      ))}
    </ul>
  );
}

/** Section page list that handles both whole uploads and orphan items
 *  (items extracted from multi-item uploads that landed elsewhere). */
function EntryList({
  entries,
  thumbs,
}: {
  entries: SectionEntry[];
  thumbs: Map<string, string>;
}) {
  return (
    <ul className="space-y-0.5">
      {entries.map((e) => {
        const isTyped = e.kind === "item" && !e.upload_id;
        const meta =
          e.kind === "item"
            ? [
                e.amount_value
                  ? e.amount_currency
                    ? `${e.amount_value} ${e.amount_currency}`
                    : e.amount_value
                  : null,
                e.occurred_at
                  ? new Date(e.occurred_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : relativeTime(e.created_at),
                isTyped ? "typed" : "from a multi-item upload",
              ]
                .filter(Boolean)
                .join(" · ")
            : `${displayActor(e.uploader)} · ${relativeTime(e.created_at)}`;
        // Typed items have no source file → render as a non-link card
        // with the structured fields visible. Uploads + items-from-files
        // link to the parent upload page so the user can drill in.
        const Inner = (
          <>
            {isTyped ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-canvas text-[10.5px] text-ink-faint">
                ✎
              </div>
            ) : (
              <Thumbnail
                mime={e.mime_type}
                imageUrl={thumbs.get(e.id) ?? null}
                filename={e.filename}
                size={32}
              />
            )}
            <div className="min-w-0 flex-1">
              {e.kind === "upload" ? (
                <p className="truncate text-[13.5px] text-ink">
                  {e.title ?? e.filename}
                </p>
              ) : (
                <p className="truncate text-[13.5px] text-ink">
                  {e.merchant || e.title}
                </p>
              )}
              <p className="truncate text-[11.5px] text-ink-faint">{meta}</p>
            </div>
            {e.kind === "upload" && e.document_type === "unknown" ? (
              <SparkIcon size={12} />
            ) : null}
          </>
        );
        return (
          <li
            key={`${e.kind}-${e.id}`}
            className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-base hover:bg-surface-raised"
          >
            {isTyped ? (
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {Inner}
              </div>
            ) : (
              <Link
                href={`/dashboard/uploads/${e.upload_id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                {Inner}
              </Link>
            )}
            {e.kind === "upload" ? (
              <InlineTrashButton uploadId={e.upload_id} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
