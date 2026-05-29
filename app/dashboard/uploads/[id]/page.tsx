import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/dashboard/topbar";
import { Preview } from "@/components/upload/preview";
import { Thumbnail } from "@/components/upload/thumbnail";
import { UnderstoodPanel } from "@/components/upload/understood";
import {
  ApprovalsIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  DownloadIcon,
  GiftIcon,
  HomeIcon,
  PlaneIcon,
  PropertiesIcon,
  SparkIcon,
  StaffIcon,
  UploadIcon,
} from "@/components/ui/icon";
import { getUploadDetail } from "@/lib/data/upload-detail";
import { recordUploadOpened } from "@/lib/data/upload-actions";
import { createReminder } from "@/lib/data/reminder-actions";
import { softDeleteUpload } from "@/lib/data/trash-actions";
import { formatBytes, relativeTime } from "@/lib/utils";
import { getSignedUrlMap } from "@/lib/data/uploads";
import { listAllSections } from "@/lib/data/all-sections";
import { getCustomSectionById } from "@/lib/data/custom-sections";
import { MovePicker } from "@/components/upload/move-picker";
import { ItemReviewPanel } from "@/components/upload/item-review-panel";
import { DescriptionBadge } from "@/components/upload/description-badge";
import { ExtractedEntitiesPanel } from "@/components/upload/extracted-entities-panel";
import { SuggestedRemindersPanel } from "@/components/upload/suggested-reminders-panel";
import { generateSuggestionsForUpload } from "@/lib/ai/suggest-reminders";
import { getCurrentContext } from "@/lib/data/organizations";
import type { EventKind, MemoryItem, Section } from "@/lib/supabase/types";

type Props = { params: Promise<{ id: string }> };

const SECTION_LABEL: Record<Section, string> = {
  household: "Household",
  travel: "Travel",
  properties: "Properties",
  staff: "Staff",
  events: "Events",
  finance: "Finance",
  legal: "Legal",
  personal: "Personal",
  vendors: "Vendors",
  health: "Health",
};

export default async function UploadDetailPage({ params }: Props) {
  const { id } = await params;
  const detail = await getUploadDetail(id);
  if (!detail) notFound();

  // Record the open. Fire and forget; failure shouldn't break the page.
  await recordUploadOpened(id).catch(() => {});

  const {
    upload,
    uploader,
    lastOpenedBy,
    signedUrl,
    reminders,
    events,
    related,
    extraction,
    items,
    extractedEntity,
  } = detail;

  // Reminder suggestions — only when extraction exists and user is authenticated.
  const ctx = await getCurrentContext();
  const suggestions = ctx && extractedEntity
    ? await generateSuggestionsForUpload(upload.id, ctx.profile.id).catch(() => [])
    : [];

  // Thumbnails for related image uploads.
  const relatedThumbs = await getSignedUrlMap(
    related.map((r) => ({ id: r.id, storage_path: r.storage_path })),
  );

  // Resolve a friendly label for the current section the upload is in:
  // builtin → "Travel", custom → custom name, neither → "Unsorted".
  let sectionLabel = "Unsorted";
  let currentRef: { kind: "builtin" | "custom" | "review"; key: string } = {
    kind: "review",
    key: "review",
  };
  if (upload.section) {
    sectionLabel = SECTION_LABEL[upload.section];
    currentRef = { kind: "builtin", key: upload.section };
  } else if (upload.custom_section_id) {
    const cs = await getCustomSectionById(upload.custom_section_id);
    if (cs) {
      sectionLabel = cs.name;
      currentRef = { kind: "custom", key: cs.id };
    }
  }

  // Section list for the Move-to picker. Hidden sections are excluded so the
  // picker mirrors the sidebar.
  const allSections = await listAllSections({
    includeHidden: false,
    includeReview: false,
  });
  const moveOptions = allSections.map((s) => ({
    ref: { kind: s.ref.kind, key: s.ref.key } as const,
    name: s.name,
  }));

  // Lookup map of custom section id → name so the review panel can render
  // the friendly section label for items already filed in a custom section.
  const customNames: Record<string, string> = {};
  for (const s of allSections) {
    if (s.ref.kind === "custom") customNames[s.ref.key] = s.name;
  }

  return (
    <>
      <Topbar title={upload.title ?? upload.filename} />

      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/dashboard/inbox"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-ink-muted transition-base hover:bg-surface-raised hover:text-ink"
        >
          <span className="-ml-0.5">←</span> Back to uploads
        </Link>
        {signedUrl ? (
          <a
            href={signedUrl}
            download={upload.filename}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-2.5 text-[12.5px] text-ink-soft transition-base hover:border-line-strong hover:text-ink"
          >
            <DownloadIcon size={12} /> Download
          </a>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3 animate-fade-up">
        <div className="lg:col-span-2">
          <Preview
            url={signedUrl}
            mime={upload.mime_type}
            filename={upload.filename}
          />
        </div>

        <aside className="space-y-6">
          <DescriptionBadge metadata={upload.metadata} />

          <ExtractedEntitiesPanel
            entity={extractedEntity}
            uploadId={upload.id}
            uploadStatus={upload.status}
          />

          <SuggestedRemindersPanel
            suggestions={suggestions}
            uploadId={upload.id}
            organizationId={upload.organization_id}
          />

          {items.length > 1 ? (
            <ItemReviewPanel
              uploadId={upload.id}
              items={items}
              sections={moveOptions}
              sectionLabels={SECTION_LABEL}
              customNames={customNames}
            />
          ) : null}

          <UnderstoodPanel
            uploadId={upload.id}
            extraction={extraction}
            status={upload.status}
            skipReason={readSkipReason(upload.metadata)}
          />

          {items.length === 1 ? <SingleItemPanel item={items[0]} /> : null}

          <SectionPanel
            label={sectionLabel}
            uploadId={upload.id}
            currentRef={currentRef}
            sections={moveOptions}
            autoFiled={detectAutoFiled(upload, items)}
          />

          <Metadata
            uploadedAt={upload.created_at}
            uploadedBy={uploader}
            sizeBytes={upload.size_bytes}
            mime={upload.mime_type}
            lastOpenedAt={upload.last_opened_at}
            lastOpenedBy={lastOpenedBy}
            filename={upload.filename}
          />

          <LinkedReminders reminders={reminders} uploadId={upload.id} />
        </aside>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <LinkedTimeline events={events} />
        <RelatedUploads
          related={related}
          thumbs={relatedThumbs}
          currentLabel={sectionLabel}
        />
      </div>

      <DeleteSection id={upload.id} filename={upload.filename} />
    </>
  );
}

function readSkipReason(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const v = (metadata as { extraction_skipped?: unknown }).extraction_skipped;
  return typeof v === "string" ? v : null;
}

function DeleteSection({ id, filename }: { id: string; filename: string }) {
  return (
    <details className="mt-12 border-t border-line pt-6 max-w-xl group">
      <summary className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-faint transition-base hover:text-claret group-open:text-claret">
        Delete this file
      </summary>
      <div className="mt-3 rounded-lg border border-line bg-surface-raised p-4">
        <p className="text-[13px] text-ink">
          Move <span className="text-ink-soft">{filename}</span> to Deleted?
        </p>
        <p className="mt-1 text-[12px] text-ink-muted">
          It will be restorable for 30 days, then permanently removed.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <form action={softDeleteUpload}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="redirect_to" value="/dashboard" />
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-lg bg-claret px-3.5 text-[12.5px] text-surface transition-base hover:bg-claret/90"
            >
              Move to Deleted
            </button>
          </form>
          <p className="text-[12px] text-ink-faint">Cancel by closing this.</p>
        </div>
      </div>
    </details>
  );
}

function SingleItemPanel({ item }: { item: MemoryItem }) {
  // Only render when we actually have structured fields worth showing —
  // otherwise the UnderstoodPanel + Section row already tell the story.
  const rows: Array<{ label: string; value: string }> = [];
  if (item.merchant) rows.push({ label: "Merchant", value: item.merchant });
  if (item.amount_value) {
    rows.push({
      label: "Amount",
      value: item.amount_currency
        ? `${item.amount_value} ${item.amount_currency}`
        : item.amount_value,
    });
  }
  if (item.occurred_at) {
    rows.push({ label: "Date", value: friendlyDate(item.occurred_at) });
  }
  if (item.location) rows.push({ label: "Where", value: item.location });
  if (item.payment_method) {
    rows.push({ label: "Paid with", value: item.payment_method });
  }
  if (item.category) rows.push({ label: "Category", value: item.category });
  if (rows.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
        At a glance
      </h2>
      <dl className="rounded-xl border border-line bg-surface-raised divide-y divide-line">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-start justify-between gap-4 px-4 py-2.5"
          >
            <dt className="text-[12px] text-ink-faint">{r.label}</dt>
            <dd className="max-w-[60%] truncate text-right text-[12.5px] text-ink">
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function friendlyDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Heuristic: did Oria choose this upload's section, or did the user?
 * We say "auto-filed" when the upload sits in a section AND at least
 * one extracted item carries that same section with high confidence —
 * the exact condition that triggers auto-filing in upload-intelligence.
 * Anything else (user-moved, low-confidence extraction, no items) shows
 * no badge so we don't claim credit incorrectly.
 */
function detectAutoFiled(
  upload: { section: string | null; custom_section_id: string | null },
  items: Array<{
    section: string | null;
    custom_section_id: string | null;
    confidence: number | null;
  }>,
): boolean {
  if (!upload.section && !upload.custom_section_id) return false;
  return items.some((it) => {
    if (it.confidence === null || it.confidence < 0.7) return false;
    if (upload.section && it.section === upload.section) return true;
    if (
      upload.custom_section_id &&
      it.custom_section_id === upload.custom_section_id
    )
      return true;
    return false;
  });
}

function SectionPanel({
  label,
  uploadId,
  currentRef,
  sections,
  autoFiled,
}: {
  label: string;
  uploadId: string;
  currentRef: { kind: "builtin" | "custom" | "review"; key: string };
  sections: { ref: { kind: "builtin" | "custom" | "review"; key: string }; name: string }[];
  autoFiled: boolean;
}) {
  const isReview = currentRef.kind === "review";
  return (
    <section>
      <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
        Section
      </h2>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-raised px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-[13.5px] text-ink">
            <span className="truncate">{label}</span>
            {autoFiled && !isReview ? (
              <span
                className="shrink-0 rounded-md bg-accent-soft/60 px-1.5 py-0.5 text-[10px] text-[#7a5a2a]"
                title="Section chosen by Oria from the file contents"
              >
                Auto-detected
              </span>
            ) : null}
          </p>
          {isReview ? (
            <p className="text-[11.5px] text-ink-faint">
              Oria couldn&apos;t place this yet. Pick a section to file it.
            </p>
          ) : null}
        </div>
        <MovePicker
          uploadId={uploadId}
          currentRef={currentRef}
          sections={sections}
        />
      </div>
    </section>
  );
}

function Metadata({
  uploadedAt,
  uploadedBy,
  sizeBytes,
  mime,
  lastOpenedAt,
  lastOpenedBy,
  filename,
}: {
  uploadedAt: string;
  uploadedBy: { full_name: string | null; email: string } | null;
  sizeBytes: number | null;
  mime: string | null;
  lastOpenedAt: string | null;
  lastOpenedBy: { full_name: string | null; email: string } | null;
  filename: string;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "File", value: filename },
    { label: "Type", value: mime ?? "Unknown" },
    { label: "Size", value: formatBytes(sizeBytes) || "Unknown" },
    {
      label: "Uploaded",
      value: `${relativeTime(uploadedAt)}, by ${displayName(uploadedBy)}`,
    },
  ];
  if (lastOpenedAt) {
    rows.push({
      label: "Last opened",
      value: `${relativeTime(lastOpenedAt)}, by ${displayName(lastOpenedBy)}`,
    });
  }
  return (
    <section>
      <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">Details</h2>
      <dl className="rounded-xl border border-line bg-surface-raised divide-y divide-line">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-start justify-between gap-4 px-4 py-2.5"
          >
            <dt className="text-[12px] text-ink-faint">{r.label}</dt>
            <dd className="max-w-[60%] truncate text-right text-[12.5px] text-ink">
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function displayName(
  p: { full_name: string | null; email: string } | null,
): string {
  if (!p) return "Unknown";
  return p.full_name?.trim() || p.email;
}

function LinkedReminders({
  reminders,
  uploadId,
}: {
  reminders: {
    id: string;
    title: string;
    due_at: string | null;
    done: boolean;
  }[];
  uploadId: string;
}) {
  return (
    <section>
      <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
        Reminders
      </h2>
      {reminders.length === 0 ? (
        <p className="mb-3 px-1 text-[12.5px] text-ink-faint">
          No reminders linked to this upload yet.
        </p>
      ) : (
        <ul className="rounded-xl border border-line bg-surface-raised divide-y divide-line">
          {reminders.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <span
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  r.done
                    ? "border-sage bg-sage text-surface"
                    : "border-line-strong"
                }`}
              >
                {r.done ? <CheckIcon size={10} /> : null}
              </span>
              <p
                className={`min-w-0 flex-1 truncate text-[13px] ${
                  r.done ? "text-ink-muted line-through" : "text-ink"
                }`}
              >
                {r.title}
              </p>
              {r.due_at ? (
                <span className="text-[11px] text-ink-faint">
                  {new Date(r.due_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <details className="group mt-3 rounded-xl border border-line bg-surface-raised">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[12.5px] text-ink-muted transition-base hover:text-ink group-open:text-ink">
          <span className="text-[13px]">+</span>
          <span>Add reminder</span>
        </summary>
        <form
          action={createReminder}
          className="flex flex-col gap-2 border-t border-line p-2.5 sm:flex-row sm:items-center"
        >
          <input type="hidden" name="upload_id" value={uploadId} />
          <input
            type="text"
            name="title"
            required
            autoFocus
            placeholder="What to remember"
            className="h-9 flex-1 rounded-md bg-canvas/60 px-2 text-[13px] text-ink placeholder:text-ink-faint outline-none focus:bg-canvas"
          />
          <input
            type="date"
            name="date"
            required
            className="h-9 rounded-md border border-line bg-canvas px-2 text-[12px] text-ink-soft outline-none focus:border-ink-muted sm:w-[130px]"
          />
          <input
            type="time"
            name="time"
            className="h-9 rounded-md border border-line bg-canvas px-2 text-[12px] text-ink-soft outline-none focus:border-ink-muted sm:w-[100px]"
          />
          <button
            type="submit"
            className="inline-flex h-9 items-center justify-center rounded-md bg-ink px-3 text-[12.5px] text-surface hover:bg-ink-soft transition-base"
          >
            Add
          </button>
        </form>
      </details>
    </section>
  );
}

function LinkedTimeline({
  events,
}: {
  events: {
    id: string;
    kind: EventKind;
    title: string;
    detail: string | null;
    created_at: string;
  }[];
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[13px] font-medium text-ink-muted">Activity</h2>
        <Link
          href="/dashboard/timeline"
          className="text-[12px] text-ink-faint hover:text-ink transition-base"
        >
          Open timeline
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="px-1 text-[12.5px] text-ink-faint">
          No activity yet on this upload.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {events.map((e) => {
            const v = visualForKind(e.kind);
            return (
              <li
                key={e.id}
                className="flex items-start gap-3 rounded-lg px-3 py-2 transition-base hover:bg-surface-raised"
              >
                <span className={`mt-0.5 ${v.color}`}>
                  <v.Icon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink">{e.title}</p>
                  {e.detail ? (
                    <p className="mt-0.5 text-[12px] text-ink-faint">{e.detail}</p>
                  ) : null}
                </div>
                <span className="text-[11px] text-ink-faint">
                  {relativeTime(e.created_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RelatedUploads({
  related,
  thumbs,
  currentLabel,
}: {
  related: {
    id: string;
    filename: string;
    title: string | null;
    section: Section | null;
    mime_type: string | null;
    storage_path: string;
    created_at: string;
  }[];
  thumbs: Map<string, string>;
  currentLabel: string;
}) {
  if (related.length === 0) {
    return (
      <section>
        <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
          Related
        </h2>
        <p className="px-1 text-[12.5px] text-ink-faint">
          No other items in {currentLabel} yet.
        </p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
        Related in {currentLabel}
      </h2>
      <ul className="space-y-0.5">
        {related.map((r) => (
          <li key={r.id}>
            <Link
              href={`/dashboard/uploads/${r.id}`}
              className="flex items-center gap-3 rounded-lg px-3 py-2 transition-base hover:bg-surface-raised"
            >
              <Thumbnail
                mime={r.mime_type}
                imageUrl={thumbs.get(r.id) ?? null}
                filename={r.filename}
                size={32}
              />
              <p className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                {r.title ?? r.filename}
              </p>
              <span className="text-[11.5px] text-ink-faint">
                {relativeTime(r.created_at)}
              </span>
              <ArrowRightIcon size={11} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function visualForKind(kind: EventKind): {
  Icon: React.ComponentType<{ size?: number }>;
  color: string;
} {
  switch (kind) {
    case "upload": return { Icon: UploadIcon, color: "text-ink-muted" };
    case "ai": return { Icon: SparkIcon, color: "text-[#7a5a2a]" };
    case "reminder": return { Icon: CalendarIcon, color: "text-ink-muted" };
    case "approval": return { Icon: ApprovalsIcon, color: "text-sage" };
    case "event": return { Icon: GiftIcon, color: "text-ink-muted" };
    case "staff": return { Icon: StaffIcon, color: "text-ink-muted" };
    case "travel": return { Icon: PlaneIcon, color: "text-ink-muted" };
    case "property": return { Icon: PropertiesIcon, color: "text-ink-muted" };
    case "household": return { Icon: HomeIcon, color: "text-ink-muted" };
    case "schedule": return { Icon: CalendarIcon, color: "text-ink-muted" };
  }
}

