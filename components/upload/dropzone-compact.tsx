"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadFile } from "@/lib/data/upload-actions";
import { CheckIcon, UploadIcon } from "@/components/ui/icon";

/**
 * Quiet single-line dropzone for the dashboard. Same upload semantics as the
 * full Dropzone, but visually one calm row instead of a hero block.
 *
 *   [📤  Drop anything here or click to add  ────────────────────────────]
 *
 * The dashboard now treats upload as one of several entry points, not the
 * centerpiece.
 */
export function DropzoneCompact() {
  const router = useRouter();
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "uploading"; name: string }
    | { kind: "done"; name: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [isPending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
      setStatus({ kind: "uploading", name: file.name });
      const formData = new FormData();
      formData.append("file", file);
      startTransition(async () => {
        const result = await uploadFile(formData);
        if (result.ok) {
          setStatus({ kind: "done", name: file.name });
          router.refresh();
        } else {
          setStatus({ kind: "error", message: result.error });
        }
      });
    },
    [router],
  );

  const busy = status.kind === "uploading" || isPending;
  const done = status.kind === "done";

  return (
    <div>
      <label
        htmlFor="oria-upload-compact"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`group flex h-12 cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-surface-raised/60 px-4 transition-base ${
          dragging
            ? "border-ink bg-canvas/80"
            : "border-line-strong hover:border-ink-muted hover:bg-surface-raised"
        }`}
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-canvas text-ink-soft">
          {done ? <CheckIcon size={13} /> : <UploadIcon size={14} />}
        </span>
        <p className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
          {busy ? (
            <>
              Uploading{" "}
              <span className="text-ink-muted">
                {status.kind === "uploading" ? status.name : ""}
              </span>
            </>
          ) : done ? (
            <>
              Added{" "}
              <span className="text-ink-muted">
                {status.kind === "done" ? status.name : ""}
              </span>
            </>
          ) : status.kind === "error" ? (
            <span className="text-claret">{status.message}</span>
          ) : (
            <>
              <span className="text-ink">Drop anything here</span>{" "}
              <span className="text-ink-faint">or click to add</span>
            </>
          )}
        </p>
        {busy ? (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
        ) : null}
        <input
          id="oria-upload-compact"
          type="file"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>
    </div>
  );
}
