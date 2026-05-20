"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadFile } from "@/lib/data/upload-actions";
import { CheckIcon, UploadIcon } from "@/components/ui/icon";

type Status =
  | { kind: "idle" }
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

export function Dropzone({
  defaultSection,
  defaultCustomSectionId,
  smartSection,
  heading = "Drop anything here",
  subheading = "Nothing gets lost. Click to browse.",
}: DropzoneProps = {}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const [description, setDescription] = useState("");
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0];
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
        setStatus({ kind: "reading", name: file.name, id: result.id });
        router.refresh();
        // Poll the status endpoint until extraction finishes or we time out.
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
        // Clear the note so a follow-up upload doesn't inherit context.
        setDescription("");
      });
    },
    [router, defaultSection, defaultCustomSectionId, smartSection, description],
  );

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

      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Add a note (optional). e.g. ‘Lunch: chicken, rice, salad.’ or ‘Electricity bill for LA.’"
        className="block h-10 w-full rounded-xl border border-line bg-surface-raised px-3.5 text-[13px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-line-strong"
        aria-label="Optional note about this upload"
      />

      <StatusBanner status={status} pending={isPending} />
    </div>
  );
}

function StatusBanner({ status, pending }: { status: Status; pending: boolean }) {
  if (status.kind === "idle") return null;
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
