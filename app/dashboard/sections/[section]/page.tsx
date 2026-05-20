import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/dashboard/topbar";
import { DropzoneCompact } from "@/components/upload/dropzone-compact";
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
import type { Section } from "@/lib/supabase/types";

type MoveOption = {
  ref: { kind: "builtin" | "custom" | "review"; key: string };
  name: string;
};

const BUILTIN_SECTIONS: Section[] = [
  "household", "travel", "properties", "staff", "events",
  "finance", "legal", "personal", "vendors", "health",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { params: Promise<{ section: string }> };

export default async function SectionPage({ params }: Props) {
  const { section } = await params;

  // Special: "review" — uploads Oria couldn't confidently classify.
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
        explainer="Items Oria couldn't confidently place yet. Tap Move to file them where they belong."
        count={uploads.length}
        dropzoneNode={null}
      >
        {uploads.length === 0 ? (
          <p className="px-1 text-[13px] text-ink-faint">
            Nothing unsorted. You&apos;re all caught up.
          </p>
        ) : (
          <UploadList items={uploads} thumbs={thumbs} moveOptions={moveOptions} />
        )}
      </Layout>
    );
  }

  // Custom section by UUID.
  if (UUID_RE.test(section)) {
    const custom = await getCustomSectionById(section);
    if (!custom) notFound();
    const entries = await listSectionEntries(
      { kind: "custom", key: custom.id },
      100,
    );
    const thumbs = await thumbsForEntries(entries);
    return (
      <Layout
        title={custom.name}
        count={entries.length}
        dropzoneNode={
          <DropzoneCompact
            defaultCustomSectionId={custom.id}
            heading={`Drop into ${custom.name}`}
            subheading="or click to add"
          />
        }
      >
        {entries.length === 0 ? (
          <p className="px-1 text-[13px] text-ink-faint">
            Nothing in {custom.name} yet. Anything you upload here stays searchable.
          </p>
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

  const entries = await listSectionEntries({ kind: "builtin", key: sec }, 100);
  const thumbs = await thumbsForEntries(entries);

  return (
    <Layout
      title={meta.label}
      count={entries.length}
      dropzoneNode={
        <DropzoneCompact
          defaultSection={sec}
          heading={`Drop into ${meta.label}`}
          subheading="or click to add"
        />
      }
    >
      {entries.length === 0 ? (
        <p className="px-1 text-[13px] text-ink-faint">
          Nothing in {meta.label} yet. Anything you upload here stays searchable.
        </p>
      ) : (
        <EntryList entries={entries} thumbs={thumbs} />
      )}
    </Layout>
  );
}

/** Fetch signed thumbnail URLs keyed by entry id. Both uploads and items
 *  show the parent file's thumb — items don't have storage of their own. */
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
  explainer,
  children,
}: {
  title: string;
  count: number;
  dropzoneNode: React.ReactNode;
  explainer?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Topbar title={title} />

      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/dashboard"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-ink-muted transition-base hover:bg-surface-raised hover:text-ink"
        >
          <span className="-ml-0.5">←</span> Home
        </Link>
        <span className="ml-auto text-[12px] text-ink-faint">
          {count} {count === 1 ? "item" : "items"}
        </span>
      </div>

      {explainer ? (
        <p className="mb-6 max-w-xl px-1 text-[13px] text-ink-muted">{explainer}</p>
      ) : null}

      {dropzoneNode ? <div className="mb-8">{dropzoneNode}</div> : null}

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
      {entries.map((e) => (
        <li
          key={`${e.kind}-${e.id}`}
          className="group flex items-center gap-3 rounded-lg px-3 py-2 transition-base hover:bg-surface-raised"
        >
          <Link
            href={`/dashboard/uploads/${e.upload_id}`}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <Thumbnail
              mime={e.mime_type}
              imageUrl={thumbs.get(e.id) ?? null}
              filename={e.filename}
              size={32}
            />
            <div className="min-w-0 flex-1">
              {e.kind === "upload" ? (
                <>
                  <p className="truncate text-[13.5px] text-ink">
                    {e.title ?? e.filename}
                  </p>
                  <p className="truncate text-[11.5px] text-ink-faint">
                    {displayActor(e.uploader)} · {relativeTime(e.created_at)}
                  </p>
                </>
              ) : (
                <>
                  <p className="truncate text-[13.5px] text-ink">
                    {e.merchant || e.title}
                  </p>
                  <p className="truncate text-[11.5px] text-ink-faint">
                    {[
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
                      "from a multi-item upload",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </>
              )}
            </div>
            {e.kind === "upload" && e.document_type === "unknown" ? (
              <SparkIcon size={12} />
            ) : null}
          </Link>
          {e.kind === "upload" ? (
            <InlineTrashButton uploadId={e.upload_id} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
