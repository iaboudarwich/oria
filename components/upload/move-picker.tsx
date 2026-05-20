"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUploadSection } from "@/lib/data/upload-actions";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  InboxIcon,
  TagIcon,
} from "@/components/ui/icon";
import { useDismissable } from "@/lib/hooks/use-dismissable";

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

  const isReview = currentRef.kind === "review";

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
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1.5 max-h-[360px] w-[240px] overflow-y-auto rounded-xl border border-line bg-surface-raised shadow-[0_10px_30px_-15px_rgba(28,26,23,0.20)] animate-fade-up"
        >
          <ul className="py-1.5">
            {sections.map((s) => {
              const active =
                s.ref.kind === currentRef.kind && s.ref.key === currentRef.key;
              const Icon = s.ref.kind === "review" ? InboxIcon : TagIcon;
              return (
                <li key={`${s.ref.kind}-${s.ref.key}`}>
                  <button
                    type="button"
                    onClick={() => move(s.ref.kind, s.ref.key)}
                    disabled={active}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-base ${
                      active
                        ? "text-ink-faint cursor-default"
                        : "text-ink-soft hover:bg-canvas hover:text-ink"
                    }`}
                  >
                    <Icon size={13} />
                    <span className="flex-1 truncate">{s.name}</span>
                    {active ? (
                      <span className="text-[10.5px] text-ink-faint">
                        Current
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
            {!isReview ? (
              <>
                <li className="my-1 h-px bg-line" />
                <li>
                  <button
                    type="button"
                    onClick={() => move("review", "review")}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink-muted transition-base hover:bg-canvas hover:text-ink"
                  >
                    <InboxIcon size={13} />
                    <span className="flex-1 truncate">Move to Unsorted</span>
                  </button>
                </li>
              </>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
