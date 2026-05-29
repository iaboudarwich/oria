"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { uploadFile } from "@/lib/data/upload-actions";
import {
  ArrowRightIcon,
  CameraIcon,
  CheckIcon,
  CloseIcon,
  UploadIcon,
} from "@/components/ui/icon";

type CompactStatus =
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

type Props = {
  /** Pre-route the upload into a specific built-in section. */
  defaultSection?: string;
  /** Pre-route into a specific custom section. */
  defaultCustomSectionId?: string;
  /** Tag for Smart Sections: tells the extractor to treat the file as a
   *  meal or a bill, which unlocks calorie/macro estimation and bill
   *  recurrence detection. */
  smartSection?: "diet" | "bills";
  /** Copy on the idle dropzone row. */
  heading?: string;
  subheading?: string;
};

/**
 * Quiet single-line dropzone used everywhere the hero one would feel
 * heavy: Diet, Bills, section pages, Work AI. When a file is picked it
 * expands into a small two-row block (preview + optional note + Upload)
 * so the note is captured *with* the file, never as a race. Same
 * content+note flow as the full Dropzone, so the AI receives both.
 *
 * After upload it polls the status endpoint and surfaces a tight
 * "Found N items / Filed X" line — same intelligence affordance as
 * the hero dropzone, just in less space.
 */
export function DropzoneCompact({
  defaultSection,
  defaultCustomSectionId,
  smartSection,
  heading = "Drop anything here",
  subheading = "or click to add",
}: Props = {}) {
  const router = useRouter();
  const inputId = useId();
  const [status, setStatus] = useState<CompactStatus>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [description, setDescription] = useState("");
  const objectUrlRef = useRef<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      if (pollRef.current) window.clearInterval(pollRef.current);
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
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
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
    if (defaultSection) formData.append("section", defaultSection);
    if (defaultCustomSectionId)
      formData.append("custom_section_id", defaultCustomSectionId);
    if (smartSection) formData.append("smart_section", smartSection);
    const note = description.trim();
    if (note) formData.append("description", note);
    startTransition(async () => {
      const result = await uploadFile(formData);
      if (!result.ok) {
        setStatus({ kind: "error", message: result.error });
        return;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setStatus({ kind: "reading", name: file.name, id: result.id });
      setDescription("");
      // Poll for extraction completion just like the hero dropzone so the
      // user gets a real "Found N items" outcome line.
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
          // ignore network blips
        }
        if (elapsed > 60_000 && pollRef.current) {
          window.clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 1500);
    });
  }, [
    status,
    description,
    defaultSection,
    defaultCustomSectionId,
    smartSection,
    router,
  ]);

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
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition-base hover:bg-canvas hover:text-ink"
          >
            <CloseIcon size={12} />
          </button>
        </div>
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              smartSection === "diet"
                ? "Lunch: chicken, rice, salad"
                : smartSection === "bills"
                  ? "March electricity for the LA apartment"
                  : "Optional note — Oria reads it with the file."
            }
            maxLength={500}
            className="block h-9 flex-1 rounded-md border border-line bg-canvas/40 px-2.5 text-[12.5px] text-ink placeholder:text-ink-faint outline-none focus:border-line-strong"
            autoFocus
          />
          <button
            type="button"
            onClick={commit}
            disabled={isPending}
            className="cta inline-flex h-9 items-center gap-1.5 rounded-md bg-ink px-3 text-[12px] text-surface transition-base hover:bg-ink-soft disabled:cursor-default disabled:opacity-50"
          >
            {isPending ? "Uploading" : "Upload"}
            <ArrowRightIcon size={11} />
          </button>
        </div>
      </div>
    );
  }

  const busy =
    status.kind === "uploading" ||
    status.kind === "reading" ||
    isPending;
  const done = status.kind === "done";
  const cameraInputId = `${inputId}-camera`;

  return (
    <div>
      <label
        htmlFor={inputId}
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
          {status.kind === "uploading" || (busy && !done) ? (
            <>
              {status.kind === "reading" ? "Oria is reading" : "Uploading"}{" "}
              <span className="text-ink-muted">
                {status.kind === "uploading" || status.kind === "reading"
                  ? status.name
                  : ""}
              </span>
            </>
          ) : done && status.kind === "done" ? (
            status.itemsCount > 1
              ? `Found ${status.itemsCount} items. ${status.sortedCount} sorted${
                  status.unsortedCount > 0
                    ? `, ${status.unsortedCount} need review`
                    : ""
                }.`
              : status.itemsCount === 1
                ? `Filed ${status.name}.`
                : `Added ${status.name}.`
          ) : status.kind === "error" ? (
            <span className="text-claret">{status.message}</span>
          ) : (
            <>
              <span className="text-ink">{heading}</span>{" "}
              <span className="text-ink-faint">{subheading}</span>
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
          id={inputId}
          type="file"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {/* Camera capture — mobile only. capture="environment" opens the
          rear camera on iOS/Android. Hidden on md+ via md:hidden so
          desktop users never see a confusing fallback button. */}
      {!busy && !done && (
        <label
          htmlFor={cameraInputId}
          className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-faint transition-base hover:text-ink-muted md:hidden"
        >
          <CameraIcon size={13} />
          Take photo
          <input
            id={cameraInputId}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      )}
    </div>
  );
}
