import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/dashboard/topbar";
import {
  getEntity,
  getEntityType,
  listEntityUploads,
} from "@/lib/data/entities";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrlMap } from "@/lib/data/uploads";
import { setPrimaryPhoto } from "@/lib/data/entity-actions";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function EntityDetailPage({ params }: Props) {
  const { id } = await params;
  const entity = await getEntity(id);
  if (!entity) notFound();

  const entityType = await getEntityType(entity.entity_type_id);
  if (!entityType) notFound();

  const allLinks = await listEntityUploads(id);
  const uploadIds = allLinks.map((l) => l.upload_id);

  let uploads: Array<{
    id: string;
    title: string | null;
    filename: string;
    mime_type: string | null;
    storage_path: string;
    created_at: string;
  }> = [];
  if (uploadIds.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("uploads")
      .select("id, title, filename, mime_type, storage_path, created_at")
      .in("id", uploadIds);
    uploads = (data ?? []) as typeof uploads;
  }

  const thumbs = await getSignedUrlMap(
    uploads.map((u) => ({ id: u.id, storage_path: u.storage_path })),
  );

  const relOptions = (entityType.relationship_options as string[]) ?? [
    "document", "photo", "other",
  ];

  return (
    <>
      <Topbar title={entity.name} />
      <div className="mx-auto max-w-2xl animate-fade-up space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-ink-faint mb-1">
              {entityType.label_singular}
            </p>
            <h1 className="text-[22px] font-semibold text-ink">{entity.name}</h1>
          </div>
          <Link
            href={`/dashboard/things/${id}/edit`}
            className="shrink-0 text-[12px] text-ink-muted hover:text-ink transition-base"
          >
            Edit
          </Link>
        </div>

        {/* Details */}
        {(entityType.field_schema ?? []).length > 0 && (
          <div className="rounded-2xl border border-line bg-surface-raised px-4 py-3">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {(entityType.field_schema ?? []).map((f) => {
                const v = entity.details[f.key];
                if (!v && v !== 0) return null;
                return (
                  <div key={f.key}>
                    <dt className="text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">
                      {f.label}
                    </dt>
                    <dd className="mt-0.5 text-[13px] text-ink">{String(v)}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        )}

        {/* Documents */}
        <div>
          <div className="flex items-center justify-between px-1 mb-3">
            <h2 className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
              Documents ({allLinks.length})
            </h2>
            <Link
              href={`/dashboard/things/${id}/link`}
              className="text-[11.5px] text-ink-muted hover:text-ink transition-base"
            >
              + Link document
            </Link>
          </div>

          {/* Relationship tabs */}
          {allLinks.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1">
              {relOptions.map((rel) => {
                const count = allLinks.filter((l) => l.relationship === rel).length;
                if (count === 0) return null;
                return (
                  <span
                    key={rel}
                    className="rounded-md border border-line bg-canvas px-2.5 py-0.5 text-[11.5px] text-ink-muted capitalize"
                  >
                    {rel} ({count})
                  </span>
                );
              })}
            </div>
          )}

          {allLinks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center">
              <p className="text-[13px] text-ink-faint">No documents linked yet.</p>
              <Link
                href={`/dashboard/things/${id}/link`}
                className="mt-2 inline-block text-[12px] text-ink-muted hover:text-ink"
              >
                Link your first document
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface-raised overflow-hidden">
              {allLinks.map((link) => {
                const upload = uploads.find((u) => u.id === link.upload_id);
                if (!upload) return null;
                const thumb = thumbs.get(upload.id);
                return (
                  <li
                    key={link.upload_id}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="h-9 w-9 rounded-md object-cover shrink-0"
                      />
                    ) : (
                      <span className="h-9 w-9 rounded-md bg-canvas shrink-0 flex items-center justify-center text-[10px] text-ink-faint uppercase">
                        {link.relationship.slice(0, 3)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/dashboard/uploads/${upload.id}`}
                        className="block truncate text-[13px] text-ink hover:underline"
                      >
                        {upload.title ?? upload.filename}
                      </Link>
                      <span className="text-[11px] text-ink-faint capitalize">
                        {link.relationship}
                      </span>
                    </div>
                    {link.relationship === "photo" && (
                      <form action={setPrimaryPhoto.bind(null, id, upload.id)}>
                        <button
                          type="submit"
                          className="text-[11px] text-ink-faint hover:text-ink transition-base"
                        >
                          {entity.primary_photo_upload_id === upload.id
                            ? "Primary"
                            : "Set primary"}
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Back */}
        <Link
          href={`/dashboard/things?type=${entity.entity_type_id}`}
          className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted hover:text-ink transition-base"
        >
          ← Back to {entityType.label_plural}
        </Link>
      </div>
    </>
  );
}
