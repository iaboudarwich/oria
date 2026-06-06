"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type Status = {
  status: "running" | "completed" | "failed" | "idle";
  emailsTotal: number;
  itemsFound: number;
} | null;

/**
 * Shown when there are no pending items. Distinguishes three cases (using the
 * aggregate scan status across all inboxes):
 *  - a scan is still running   -> stay quiet (ScanProgress shows the bar)
 *  - a scan found items, all reviewed -> "all caught up"
 *  - the last scan found nothing -> a diagnostic with a "scan a longer window"
 *    action, so the user does not read silence as a dead feature.
 */
export function ScanEmptyState({ status }: { status: Status }) {
  const t = useTranslations("gmailReview");
  const router = useRouter();
  const [scanning, setScanning] = useState(false);

  if (status?.status === "running") return null;

  // Items were found previously and the user has cleared the queue.
  if (status && status.itemsFound > 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface-raised px-5 py-10 text-center">
        <p className="text-[14px] font-medium text-ink">{t("empty_title")}</p>
        <p className="mt-1 text-[13px] text-ink-muted">{t("all_clear")}</p>
      </div>
    );
  }

  function scanLonger() {
    setScanning(true);
    void fetch("/api/connections/gmail/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ months: 12 }),
    }).then(() => router.refresh());
  }

  const checked = status?.emailsTotal ?? 0;
  return (
    <div className="rounded-2xl border border-line bg-surface-raised px-5 py-10 text-center">
      <p className="text-[14px] font-medium text-ink">{t("diagnostic_title")}</p>
      <p className="mt-1.5 text-[13px] text-ink-muted">
        {t("diagnostic_body", { count: checked })}
      </p>
      <button
        type="button"
        onClick={scanLonger}
        disabled={scanning}
        className="transition-base mt-4 rounded-xl bg-ink px-4 py-2 text-[13px] font-medium text-surface hover:bg-ink-soft disabled:opacity-50"
      >
        {scanning ? t("scanning_starting") : t("scan_longer")}
      </button>
    </div>
  );
}
