"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type Job = {
  id: string;
  status: "running" | "completed" | "failed" | "canceled";
  emailsTotal: number;
  emailsProcessed: number;
  itemsFound: number;
} | null;

/**
 * Scan status banner for the Gmail review page. On first land after connecting
 * (no prior job, no items) it auto-starts the initial scan, then polls progress
 * and refreshes the server-rendered list when the scan completes.
 */
export function ScanProgress({
  initialJob,
  hasItems,
}: {
  initialJob: Job;
  hasItems: boolean;
}) {
  const t = useTranslations("gmailReview");
  const router = useRouter();
  const [job, setJob] = useState<Job>(initialJob);
  const [starting, setStarting] = useState(false);
  const startedRef = useRef(false);

  const startScan = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarting(true);
    try {
      const res = await fetch("/api/connections/gmail/scan", { method: "POST" });
      const data = (await res.json()) as { jobId?: string };
      if (data.jobId) {
        setJob({ id: data.jobId, status: "running", emailsTotal: 0, emailsProcessed: 0, itemsFound: 0 });
      }
    } finally {
      setStarting(false);
    }
  }, []);

  // Auto-start the initial scan exactly once when there is nothing yet.
  useEffect(() => {
    if (!initialJob && !hasItems) void startScan();
  }, [initialJob, hasItems, startScan]);

  // Poll while a scan is running.
  useEffect(() => {
    if (job?.status !== "running") return;
    let active = true;
    const tick = async () => {
      if (!active) return;
      try {
        const res = await fetch("/api/connections/gmail/scan");
        const data = (await res.json()) as { job: Job };
        if (!active) return;
        setJob(data.job);
        if (data.job && data.job.status !== "running") {
          router.refresh();
          return;
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
  }, [job?.status, router]);

  const isRunning = job?.status === "running" || starting;

  function rescan() {
    startedRef.current = false;
    void startScan();
  }

  if (isRunning) {
    const total = job?.emailsTotal ?? 0;
    const processed = job?.emailsProcessed ?? 0;
    const itemsFound = job?.itemsFound ?? 0;
    const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
    return (
      <div className="rounded-xl border border-line bg-surface-raised px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-ink" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-ink">{t("scanning_title")}</p>
            <p className="text-[12px] text-ink-muted">
              {total > 0
                ? `${t("scanning_progress", { processed, total })} · ${t("scanning_found", { count: itemsFound })}`
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

  if (job?.status === "failed") {
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

  // Completed (or no job, with items already present).
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-raised px-4 py-3">
      <p className="text-[13px] text-ink-muted">
        {t("found_count", { count: job?.itemsFound ?? 0 })}
      </p>
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
