"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { uploadFile } from "@/lib/data/upload-actions";
import {
  ArrowRightIcon,
  CheckIcon,
  CloseIcon,
  UploadIcon,
} from "@/components/ui/icon";

type CompactStatus =
  | { kind: "idle" }
  | { kind: "ready"; file: File; previewUrl: string | null }
  | { kind: "uploading"; name: string }
  | { kind: "done"; name: string }
  | { kind: "error"; message: string };

/**
 * Quiet single-line dropzone for the dashboard. When a file is selected it
 * expands into a two-row block (preview + optional note + Upload) so the
 * note is captured *with* the file, never as a race. Same content+note
 * flow as the full Dropzone, so the AI receives both.
 */
export function DropzoneCompact() {
  const [status, setStatus] = useState<CompactStatus>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [description, setDescription] = useState("");
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const pickFile = useCallback((file: File) => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    let previewUrl: string | null = null;
    if (file.type.startsWith("image/")) {
      previewUrl = URL.createObjectURL(file);
      objectUrlRef.current = previewUrl;
    }
    setStatus({ kind: "ready", file, previewUrl });
  }, []);

  const reset = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setStatus({ kind: "idle" });
    setDescription("");
  }, []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      pickFile(files[0]);
    },
    [pickFile],
  );

  const commit = useCallback(() => {
    if (status.kind !== "ready") return;
    const file = status.file;
    setStatus({ kind: "uploading", name: file.name });
    const formData = new FormData();
    formData.append("file", file);
    const note = description.trim();
    if (note) formData.append("description", note);
    startTransition(async () => {
      const result = await uploadFile(formData);
      if (result.ok) {
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
        setStatus({ kind: "done", name: file.name });
        setDescription("");
      } else {
        setStatus({ kind: "error", message: result.error });
      }
    });
  }, [status, description]);

  const busy = status.kind === "uploading" || isPending;
  const done = status.kind === "done";

  if (status.kind === "ready") {
    return (
      <div className="space-y-2 rounded-xl border border-line-strong bg-surface-raised p-2.5">
        <div className="flex items-center gap-2.5">
          {status.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={status.previewUrl}
              alt={status.file.name}
              className="h-9 w-9 shrink-0 rounded-md border border-line bg-canvas object-cover"
            />
          ) : (
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-[10px] font-medium text-ink-muted">
              {(status.file.name.split(".").pop() ?? "FILE")
                .toUpperCase()
                .slice(0, 4)}
            </span>
          )}
          <p className="min-w-0 flex-1 truncate text-[13px] text-ink">
            {status.file.name}
          </p>
          <button
            type="button"
            onClick={reset}
            aria-label="Remove file"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-ink-faint transition-base hover:bg-canvas hover:text-ink"
          >
            <CloseIcon size={12} />
          </button>
        </div>
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional note — Oria reads it with the file."
            maxLength={500}
            className="block h-9 flex-1 rounded-md border border-line bg-canvas/40 px-2.5 text-[12.5px] text-ink placeholder:text-ink-faint outline-none focus:border-line-strong"
            autoFocus
          />
          <button
            type="button"
            onClick={commit}
            disabled={isPending}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-ink px-3 text-[12px] text-surface transition-base hover:bg-ink-soft disabled:cursor-default disabled:opacity-50"
          >
            {isPending ? "Uploading" : "Upload"}
            <ArrowRightIcon size={11} />
          </button>
        </div>
      </div>
    );
  }

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
