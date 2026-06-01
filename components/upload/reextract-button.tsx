"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateIcon } from "@/components/ui/icon";
import { reextractUpload } from "@/lib/data/upload-actions";

/**
 * "Re-extract" affordance on the upload detail page. Re-runs the extraction
 * pipeline from scratch. Gated behind an inline confirmation because it may
 * consume AI tokens.
 */
export function ReextractButton({ uploadId }: { uploadId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    const fd = new FormData();
    fd.set("id", uploadId);
    startTransition(async () => {
      await reextractUpload(fd);
      setConfirming(false);
      router.refresh();
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface-raised px-3 text-[12px] font-medium text-ink transition-base hover:border-ink-muted"
      >
        <RotateIcon size={13} />
        Re-extract
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-canvas p-3">
      <p className="text-[12.5px] text-ink-soft">
        Re-read this document from scratch? This re-runs the AI pipeline and may
        use tokens.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="inline-flex h-8 items-center rounded-md bg-ink px-3 text-[12px] font-medium text-surface transition-base hover:bg-ink-soft disabled:opacity-50"
        >
          {pending ? "Starting..." : "Re-extract"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-[12px] text-ink-faint transition-base hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
