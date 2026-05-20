"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUploadSection } from "@/lib/data/upload-actions";
import { ArrowRightIcon, ChevronDownIcon } from "@/components/ui/icon";
import { useDismissable } from "@/lib/hooks/use-dismissable";
import { MoveMenu } from "./move-menu";

type SectionItem = {
  ref: { kind: "builtin" | "custom" | "review"; key: string };
  name: string;
};

type Props = {
  uploadId: string;
  currentRef: { kind: "builtin" | "custom" | "review"; key: string };
  sections: SectionItem[];
  variant?: "button" | "inline-quiet";
};

/**
 * Apple-Notes-style "Move to..." picker.
 *
 * Two visual variants:
 *   • button — labelled pill used on the upload detail page
 *   • inline-quiet — compact text trigger used on list rows for fast cleanup
 */
export function MovePicker({
  uploadId,
  currentRef,
  sections,
  variant = "button",
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { ref, open, setOpen, toggle } = useDismissable<HTMLDivElement>();

  function move(kind: string, key: string) {
    const fd = new FormData();
    fd.set("upload_id", uploadId);
    fd.set("target_kind", kind);
    fd.set("target_key", key);
    setOpen(false);
    startTransition(async () => {
      await setUploadSection(fd);
      router.refresh();
    });
  }

  return (
    <div ref={ref} className="relative">
      {variant === "button" ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          disabled={pending}
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-base disabled:opacity-50 ${
            open
              ? "border-line-strong bg-canvas text-ink"
              : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink"
          }`}
        >
          {pending ? "Moving" : "Move to"}
          <ChevronDownIcon
            size={12}
            className={`transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          disabled={pending}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] text-ink-muted transition-base hover:bg-canvas hover:text-ink disabled:opacity-50"
        >
          {pending ? "Moving" : "Move"}
          <ArrowRightIcon size={11} />
        </button>
      )}

      {open ? (
        <MoveMenu
          sections={sections}
          currentRef={currentRef}
          onMove={move}
          width={240}
          maxHeight={360}
        />
      ) : null}
    </div>
  );
}
