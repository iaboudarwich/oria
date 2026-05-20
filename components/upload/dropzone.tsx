"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadFile } from "@/lib/data/upload-actions";
import { ArrowRightIcon, CheckIcon, CloseIcon, UploadIcon } from "@/components/ui/icon";

type Status =
  | { kind: "idle" }
  | { kind: "ready"; file: File; previewUrl: string | null }
  | { kind: "uploading"; name: string }
  | { kind: "reading"; name: string; id: string }
  | {
      kind: "done";
      name: string;
      itemsCount: number;
      sortedCount: number;
      unsortedCount: number;
    }
  | { kind: "error"; message: string };

type DropzoneProps = {
  /** Pre-file uploads into a specific built-in section or custom section. */
  defaultSection?: string;
  defaultCustomSectionId?: string;
  /**
   * Tag the upload for a Smart Section. When set, the extractor treats the
   * file as that kind (meal photo / bill / invoice) so classification +
   * nutrition / recurring detection are applied automatically.
   */
  smartSection?: "diet" | "bills";
  /** Optional copy override. */
  heading?: string;
  subheading?: string;
};

/**
 * Two-phase dropzone. Phase 1: user selects a file (click or drop). Phase 2:
 * the file appears as a small preview alongside the optional note input and
 * an explicit Upload button. The user can replace the file or back out
 * before committing. The Upload button is the only path that actually
 * commits, so the note is always captured *with* the file — not after,
 * not as a race.
 *
 * The AI extractor receives both the file content and the note (via
 * uploadFile → metadata.user_description → processUpload → extractFromUpload).
 * That makes the note useful for every kind of file — meal photo,
 * receipt, lease, contract, spreadsheet, anything.
 */
export function Dropzone({
  defaultSection,
  defaultCustomSectionId,
  smartSection,
  heading = "Drop anything here",
  subheading = "Add a short note if you want, then upload.",
}: DropzoneProps = {}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [description, setDescription] = useState("");
  const pollRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const pickFile = useCallback((file: File) => {
    // Revoke any prior preview URL before swapping.
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

  const clearPick = useCallback(() => {
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

  const commitUpload = useCallback(() => {
    if (status.kind !== "ready") return;
    const file = status.file;
    const formData = new FormData();
    formData.append("file", file);
    if (defaultSection) formData.append("section", defaultSection);
    if (defaultCustomSectionId)
      formData.append("custom_section_id", defaultCustomSectionId);
    if (smartSection) formData.append("smart_section", smartSection);
    const note = description.trim();
    if (note) formData.append("description", note);

    setStatus({ kind: "uploading", name: file.name });
    startTransition(async () => {
      const result = await uploadFile(formData);
      if (!result.ok) {
        setStatus({ kind: "error", message: result.error });
        return;
      }
      // Free the preview URL — file bytes are server-side now.
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setStatus({ kind: "reading", name: file.name, id: result.id });
      // uploadFile already revalidates /dashboard, /dashboard/inbox, and
      // /dashboard/timeline server-side; no router.refresh() needed here.
      // We refresh once polling finishes (the background extraction runs
      // after the response and can't revalidate itself).
      if (pollRef.current) window.clearInterval(pollRef.current);
      let elapsed = 0;
      pollRef.current = window.setInterval(async () => {
        elapsed += 1500;
        try {
          const r = await fetch(`/api/uploads/${result.id}/status`, {
            cache: "no-store",
          });
          if (!r.ok) return;
          const data = (await r.json()) as {
            status: string;
            items_count: number;
            sorted_count: number;
            unsorted_count: number;
          };
          if (data.status === "filed" || data.status === "failed") {
            if (pollRef.current) window.clearInterval(pollRef.current);
            pollRef.current = null;
            setStatus({
              kind: "done",
              name: file.name,
              itemsCount: data.items_count,
              sortedCount: data.sorted_count,
              unsortedCount: data.unsorted_count,
            });
            router.refresh();
          }
        } catch {
          // Network blip; we'll try again next tick.
        }
        if (elapsed > 60_000 && pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 1500);
      // Reset description for a follow-up upload.
      setDescription("");
    });
  }, [
    status,
    description,
    defaultSection,
    defaultCustomSectionId,
    smartSection,
    router,
  ]);

  // -- IDLE: classic dropzone target ------------------------------------------
  if (status.kind === "idle") {
    return (
      <div className="space-y-3">
        <label
          htmlFor="oria-upload-input"
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
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center shadow-[0_1px_2px_rgba(28,26,23,0.04)] transition-base sm:py-14 ${
            dragging
              ? "scale-[1.005] border-ink bg-canvas/80 shadow-[0_8px_24px_-16px_rgba(28,26,23,0.20)]"
              : "border-line-strong bg-surface-raised/60 hover:border-ink-muted hover:bg-surface-raised hover:shadow-[0_4px_16px_-12px_rgba(28,26,23,0.18)]"
          }`}
        >
          <UploadIcon size={20} />
          <div>
            <h2 className="text-[20px] font-semibold tracking-tight text-ink">
              {heading}
            </h2>
            <p className="mt-1 text-[13px] text-ink-muted">{subheading}</p>
          </div>
          <input
            id="oria-upload-input"
            type="file"
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      </div>
    );
  }

  // -- READY: preview + note + Upload -----------------------------------------
  if (status.kind === "ready") {
    return (
      <div className="space-y-3 rounded-2xl border border-line-strong bg-surface-raised p-4 shadow-[0_1px_2px_rgba(28,26,23,0.04)]">
        <div className="flex items-start gap-3">
          <FilePreview
            file={status.file}
            previewUrl={status.previewUrl}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] text-ink">{status.file.name}</p>
            <p className="text-[11.5px] text-ink-faint">
              {formatBytes(status.file.size)} · {status.file.type || "file"}
            </p>
          </div>
          <button
            type="button"
            onClick={clearPick}
            aria-label="Remove file"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-ink-faint transition-base hover:bg-canvas hover:text-ink"
          >
            <CloseIcon size={12} />
          </button>
        </div>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Add a note (optional). e.g. ‘Lunch: chicken, rice, salad.’ or ‘March electricity bill for the LA apartment.’"
          className="block w-full resize-y rounded-lg border border-line bg-canvas/40 px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-line-strong"
          aria-label="Optional note about this upload"
          autoFocus
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-ink-faint">
            Oria reads the file and your note together.
          </p>
          <div className="flex items-center gap-2">
            <label
              htmlFor="oria-upload-replace"
              className="cursor-pointer text-[12px] text-ink-muted transition-base hover:text-ink"
            >
              Replace
              <input
                id="oria-upload-replace"
                type="file"
                className="sr-only"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>
            <button
              type="button"
              onClick={commitUpload}
              disabled={isPending}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-ink px-3.5 text-[12.5px] text-surface transition-base hover:bg-ink-soft disabled:cursor-default disabled:opacity-50"
            >
              {isPending ? "Uploading" : "Upload"}
              <ArrowRightIcon size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -- Progress / done / error banners ----------------------------------------
  return (
    <div className="space-y-3">
      <StatusBanner status={status} pending={isPending} />
      {status.kind === "done" || status.kind === "error" ? (
        <button
          type="button"
          onClick={clearPick}
          className="cursor-pointer text-[12px] text-ink-muted transition-base hover:text-ink"
        >
          Upload another
        </button>
      ) : null}
    </div>
  );
}

function FilePreview({
  file,
  previewUrl,
}: {
  file: File;
  previewUrl: string | null;
}) {
  if (previewUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={previewUrl}
        alt={file.name}
        className="h-14 w-14 shrink-0 rounded-lg border border-line bg-canvas object-cover"
      />
    );
  }
  const ext = file.name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "FILE";
  return (
    <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-line bg-canvas text-[10.5px] font-medium text-ink-muted">
      {ext}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBanner({ status, pending }: { status: Status; pending: boolean }) {
  if (status.kind === "idle" || status.kind === "ready") return null;
  if (status.kind === "uploading" || pending) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-raised px-4 py-3">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <p className="text-[13px] text-ink">
          Uploading{" "}
          <span className="text-ink-muted">
            {status.kind === "uploading" ? status.name : ""}
          </span>
        </p>
      </div>
    );
  }
  if (status.kind === "reading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-raised px-4 py-3">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <p className="text-[13px] text-ink">
          Oria is reading{" "}
          <span className="text-ink-muted">{status.name}</span>
        </p>
      </div>
    );
  }
  if (status.kind === "done") {
    const { itemsCount, sortedCount, unsortedCount, name } = status;
    const message =
      itemsCount > 1
        ? `Found ${itemsCount} items. ${sortedCount} sorted${
            unsortedCount > 0 ? `, ${unsortedCount} need review` : ""
          }.`
        : itemsCount === 1
          ? `Filed ${name}.`
          : `Added ${name}.`;
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-raised px-4 py-3">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-sage/15 text-sage">
          <CheckIcon size={11} />
        </span>
        <p className="text-[13px] text-ink">{message}</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-claret/20 bg-claret/5 px-4 py-3 text-[13px] text-claret">
      {status.message}
    </div>
  );
}
