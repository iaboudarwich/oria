"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export type AggregateStatus = {
  status: "running" | "completed" | "failed" | "idle";
  inboxes: number;
  inboxesScanning: number;
  emailsTotal: number;
  emailsProcessed: number;
  itemsFound: number;
  emailsSkipped: number;
};

/**
 * Scan status banner for the Gmail review page, aggregated across every
 * connected inbox. On first land after connecting (no jobs yet, no items) it
 * auto-starts a scan of all inboxes, polls aggregate progress, and refreshes
 * the server-rendered list when scanning finishes.
 */
export function ScanProgress({
  initialStatus,
  hasItems,
}: {
  initialStatus: AggregateStatus;
  hasItems: boolean;
}) {
  const t = useTranslations("gmailReview");
  const router = useRouter();
  const [agg, setAgg] = useState<AggregateStatus>(initialStatus);
  const [starting, setStarting] = useState(false);
  const startedRef = useRef(false);

  const startScan = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarting(true);
    try {
      await fetch("/api/connections/gmail/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setAgg((a) => ({ ...a, status: "running" }));
    } finally {
      setStarting(false);
    }
  }, []);

  // Auto-start a scan of all inboxes exactly once when there is nothing yet.
  useEffect(() => {
    if (initialStatus.status === "idle" && !hasItems) void startScan();
  }, [initialStatus.status, hasItems, startScan]);

  // Poll while a scan is running.
  useEffect(() => {
    if (agg.status !== "running") return;
    let active = true;
    const tick = async () => {
      if (!active) return;
      try {
        const res = await fetch("/api/connections/gmail/scan");
        const data = (await res.json()) as { status: AggregateStatus };
        if (!active) return;
        if (data.status) {
          setAgg(data.status);
          if (data.status.status !== "running") {
            router.refresh();
            return;
          }
        }
      } catch {
        // transient; keep polling
      }
      if (active) window.setTimeout(tick, 2500);
    };
    const id = window.setTimeout(tick, 2500);
    return () => {
      active = false;
      window.clearTimeout(id);
    };
  }, [agg.status, router]);

  const isRunning = agg.status === "running" || starting;

  function rescan() {
    startedRef.current = false;
    void startScan();
  }

  if (isRunning) {
    const total = agg.emailsTotal;
    const processed = agg.emailsProcessed;
    const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
    const scanningCount = Math.max(1, agg.inboxesScanning);
    const title = scanningCount > 1 ? t("scanning_inboxes", { count: scanningCount }) : t("scanning_title");
    return (
      <div className="rounded-xl border border-line bg-surface-raised px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-ink" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-ink">{title}</p>
            <p className="text-[12px] text-ink-muted">
              {total > 0
                ? `${t("scanning_progress", { processed, total })} · ${t("scanning_found", { count: agg.itemsFound })}`
                : t("scanning_starting")}
            </p>
          </div>
        </div>
        {total > 0 ? (
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full bg-ink transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (agg.status === "failed") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-claret/30 bg-claret/5 px-4 py-3">
        <p className="text-[13px] text-claret">{t("scan_failed")}</p>
        <button
          type="button"
          onClick={rescan}
          className="shrink-0 rounded-lg border border-line-strong px-3 py-1.5 text-[12px] font-medium text-ink transition-base hover:bg-surface"
        >
          {t("rescan")}
        </button>
      </div>
    );
  }

  // Completed / idle.
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-raised px-4 py-3">
      <p className="text-[13px] text-ink-muted">{t("found_count", { count: agg.itemsFound })}</p>
      <button
        type="button"
        onClick={rescan}
        className="shrink-0 rounded-lg border border-line-strong px-3 py-1.5 text-[12px] font-medium text-ink transition-base hover:bg-surface"
      >
        {t("rescan")}
      </button>
    </div>
  );
}
