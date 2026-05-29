import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/dashboard/topbar";
import { getEntity, getEntityType } from "@/lib/data/entities";
import { linkUploadToEntity } from "@/lib/data/entity-actions";
import { listUploadsWithUploader } from "@/lib/data/uploads";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export default async function LinkUploadToEntityPage({ params }: Props) {
  const { id } = await params;
  const entity = await getEntity(id);
  if (!entity) notFound();
  const entityType = await getEntityType(entity.entity_type_id);
  if (!entityType) notFound();

  const uploads = await listUploadsWithUploader({ limit: 50 });
  const relOptions = (entityType.relationship_options as string[]) ?? [
    "document", "photo", "other",
  ];

  async function handleLink(formData: FormData): Promise<void> {
    "use server";
    const uploadId = String(formData.get("upload_id") ?? "");
    const rel = String(formData.get("relationship") ?? "document");
    if (!uploadId) return;
    await linkUploadToEntity(id, uploadId, rel);
    redirect(`/dashboard/things/${id}`);
  }

  return (
    <>
      <Topbar title="Link Document" />
      <div className="mx-auto max-w-lg animate-fade-up">
        <p className="mb-5 text-[13px] text-ink-muted">
          Link a document to <strong>{entity.name}</strong>.
        </p>
        <form action={handleLink} className="space-y-5">
          <div>
            <label className="block text-[13px] text-ink mb-1">Document</label>
            <select
              name="upload_id"
              required
              className="block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 text-[15px] text-ink outline-none focus:border-ink"
            >
              <option value="">Choose a document...</option>
              {uploads.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.title ?? u.filename}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[13px] text-ink mb-1">Relationship</label>
            <select
              name="relationship"
              className="block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 text-[15px] text-ink outline-none focus:border-ink"
            >
              {relOptions.map((r) => (
                <option key={r} value={r} className="capitalize">
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              className="inline-flex h-11 items-center rounded-xl bg-ink px-5 text-[13.5px] text-surface hover:bg-ink-soft transition-base"
            >
              Link document
            </button>
            <Link
              href={`/dashboard/things/${id}`}
              className="text-[13px] text-ink-muted hover:text-ink transition-base"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
