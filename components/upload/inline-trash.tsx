"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { softDeleteUpload } from "@/lib/data/trash-actions";
import { TrashIcon } from "@/components/ui/icon";

/**
 * Quiet trash button for upload rows. Click once → the icon swaps to a
 * "Delete?" / Cancel pair. Click "Delete?" again to commit. The confirm
 * state auto-cancels after 4 seconds so a forgotten click doesn't leave
 * the row armed. softDeleteUpload runs without a redirect_to so the user
 * stays on the list and watches the row disappear in place.
 */
export function InlineTrashButton({ uploadId }: { uploadId: string }) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!armed) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setArmed(false), 4000);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [armed]);

  function commit() {
    if (pending) return;
    const fd = new FormData();
    fd.set("id", uploadId);
    startTransition(async () => {
      await softDeleteUpload(fd);
      // softDeleteUpload calls revalidatePath; the row will unmount on
      // its own. No need to do anything else here.
    });
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setArmed(true);
        }}
        aria-label="Delete"
        title="Delete"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-canvas hover:text-claret"
      >
        <TrashIcon size={13} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          commit();
        }}
        disabled={pending}
        className="inline-flex h-7 items-center rounded-md bg-claret px-2 text-[11px] text-surface transition-base hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Deleting" : "Delete?"}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setArmed(false);
        }}
        className="inline-flex h-7 items-center rounded-md px-2 text-[11px] text-ink-muted transition-base hover:bg-canvas hover:text-ink"
      >
        Cancel
      </button>
    </div>
  );
}
