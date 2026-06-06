"use client";

import { useRouter } from "next/navigation";
import { ChevronLeftIcon } from "@/components/ui/icon";
import { useTranslations } from "next-intl";

/**
 * A visible Back control. Swipe-back (the browser/OS gesture) is an accelerator,
 * never the only path, so detail and sub pages always show this too, which
 * matters most in the installed PWA where there is no browser chrome. Uses the
 * history when there is one, else falls back to `href`. The chevron carries
 * .oria-icon-dir so it mirrors under RTL.
 */
export function BackButton({ href, label }: { href: string; label?: string }) {
  const router = useRouter();
  const t = useTranslations("nav");

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(href);
      }}
      className="transition-base inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-[12.5px] text-ink-muted hover:bg-surface-raised hover:text-ink"
    >
      <ChevronLeftIcon size={14} className="oria-icon-dir" />
      {label ?? t("back")}
    </button>
  );
}
