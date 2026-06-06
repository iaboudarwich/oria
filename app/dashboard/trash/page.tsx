import { Topbar } from "@/components/dashboard/topbar";
import { Thumbnail } from "@/components/upload/thumbnail";
import { daysUntilPurge, listTrashUploads, purgeExpiredTrash } from "@/lib/data/trash";
import { permanentlyDeleteUpload, restoreUpload } from "@/lib/data/trash-actions";
import { getSignedUrlMap } from "@/lib/data/uploads";
import { displayActor } from "@/lib/data/timeline";

export const metadata = { title: "Deleted" };

export default async function TrashPage() {
  // Lazy cleanup: any rows past the 30-day window are hard-deleted now.
  await purgeExpiredTrash();

  const items = await listTrashUploads(100);
  const thumbs = await getSignedUrlMap(
    items.map((u) => ({ id: u.id, storage_path: u.storage_path })),
  );

  return (
    <>
      <Topbar title="Deleted" />

      <p className="mb-6 max-w-xl px-1 text-[13px] text-ink-muted">
        Items here are kept for 30 days, then permanently removed.
      </p>

      <div className="animate-fade-up">
        {items.length === 0 ? (
          <p className="px-1 text-[13px] text-ink-faint">
            Nothing here. Anything you delete will land here first.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((u) => {
              const days = u.deleted_at ? daysUntilPurge(u.deleted_at) : 0;
              return (
                <li
                  key={u.id}
                  className="transition-base flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-raised sm:flex-nowrap"
                >
                  <Thumbnail
                    mime={u.mime_type}
                    imageUrl={thumbs.get(u.id) ?? null}
                    filename={u.filename}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] text-ink">{u.title ?? u.filename}</p>
                    <p className="truncate text-[11.5px] text-ink-faint">
                      Deleted by {displayActor(u.uploader)} ·{" "}
                      {days === 0
                        ? "removes today"
                        : days === 1
                          ? "removes tomorrow"
                          : `removes in ${days} days`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={restoreUpload}>
                      <input type="hidden" name="id" value={u.id} />
                      <button
                        type="submit"
                        className="transition-base inline-flex h-8 items-center rounded-lg border border-line bg-surface-raised px-2.5 text-[12px] text-ink-soft hover:border-line-strong hover:text-ink"
                      >
                        Restore
                      </button>
                    </form>
                    <form action={permanentlyDeleteUpload}>
                      <input type="hidden" name="id" value={u.id} />
                      <button
                        type="submit"
                        className="transition-base text-[11.5px] text-ink-faint hover:text-claret"
                      >
                        Delete now
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
