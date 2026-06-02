"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/** Fans out a scan to every active connection at once (POST with no id). */
export function GmailScanAllButton() {
  const t = useTranslations("connections");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function scanAll() {
    startTransition(async () => {
      await fetch("/api/connections/gmail/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={scanAll}
      disabled={pending}
      className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3.5 text-[12.5px] font-medium text-ink transition-base hover:bg-surface-raised disabled:opacity-50"
    >
      {pending ? t("scanning_all") : t("scan_all")}
    </button>
  );
}
