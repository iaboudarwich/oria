"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { setGmailPaused } from "@/lib/integrations/gmail/connection-actions";
import { GmailFilters, type SpaceOption } from "./gmail-filters";

export type ConnectionView = {
  id: string;
  email: string;
  status: "active" | "paused" | "revoked" | "error";
  lastSyncedAt: string | null;
};

type FilterConfig = {
  excludeKeywords: string[];
  excludeSenders: string[];
  excludeWithAttachments: boolean;
  workspaceRouting: "personal" | "work" | "auto";
  routingMode: "auto" | "fixed";
  routingTargetOrgIds: string[];
};

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * One connected Gmail account: its status, item counts, and its own controls
 * (Scan, Pause/Resume, Disconnect) plus per-connection confidentiality filters
 * and workspace routing. All actions are scoped to this connection's id, so
 * acting on one account never touches another.
 */
export function GmailConnectionCard({
  connection,
  counts,
  filters,
  spaces = [],
}: {
  connection: ConnectionView;
  counts: { pending: number; approved: number };
  filters: FilterConfig;
  spaces?: SpaceOption[];
}) {
  const t = useTranslations("connections");
  const router = useRouter();
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function scan() {
    startTransition(async () => {
      await fetch("/api/connections/gmail/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id }),
      });
      router.refresh();
    });
  }

  function togglePause() {
    const next = connection.status !== "paused";
    startTransition(async () => {
      await setGmailPaused(connection.id, next);
      router.refresh();
    });
  }

  function disconnect(deleteData: boolean) {
    startTransition(async () => {
      await fetch("/api/connections/gmail/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id, deleteData }),
      });
      setDisconnectOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised p-5 shadow-[0_1px_2px_rgba(28,26,23,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-ink">{connection.email}</p>
          <p className="mt-1 text-[11.5px] text-ink-faint">
            {t(`status_${connection.status}`)}
            {connection.lastSyncedAt
              ? ` · ${t("last_sync", { time: relativeTime(connection.lastSyncedAt) })}`
              : ""}
          </p>
          <p className="mt-1.5 text-[12px] text-ink-muted">
            {t("items_summary", { pending: counts.pending, approved: counts.approved })}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button href="/dashboard/connections/gmail/review" variant="secondary" size="sm">
            {t("review")}
            {counts.pending > 0 ? (
              <span className="ml-1.5 rounded-full bg-ink px-1.5 text-[10.5px] font-semibold text-surface">
                {counts.pending}
              </span>
            ) : null}
          </Button>
          <button
            type="button"
            onClick={scan}
            disabled={pending}
            className="transition-base inline-flex h-8 items-center rounded-lg border border-line-strong px-3 text-[12px] font-medium text-ink hover:bg-surface disabled:opacity-50"
          >
            {t("scan")}
          </button>
          <button
            type="button"
            onClick={togglePause}
            disabled={pending}
            className="transition-base inline-flex h-8 items-center rounded-lg border border-line-strong px-3 text-[12px] font-medium text-ink hover:bg-surface disabled:opacity-50"
          >
            {connection.status === "paused" ? t("resume") : t("pause")}
          </button>
          <button
            type="button"
            onClick={() => setDisconnectOpen(true)}
            disabled={pending}
            className="transition-base inline-flex h-8 items-center rounded-lg border border-line-strong px-3 text-[12px] font-medium text-claret hover:bg-claret/5 disabled:opacity-50"
          >
            {t("disconnect")}
          </button>
        </div>
      </div>

      <GmailFilters connectionId={connection.id} initial={filters} spaces={spaces} />

      {disconnectOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`gmail-disconnect-${connection.id}`}
          className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6"
        >
          <div
            aria-hidden
            onClick={() => !pending && setDisconnectOpen(false)}
            className="animate-fade-in absolute inset-0 bg-ink/40 backdrop-blur-sm"
          />
          <div className="animate-scale-in relative z-[121] w-full max-w-md rounded-2xl border border-line bg-surface-raised p-6 shadow-xl">
            <h2 id={`gmail-disconnect-${connection.id}`} className="text-title text-ink">
              {t("disconnect_title")}
            </h2>
            <p className="text-body mt-3 text-ink-soft">
              {t("disconnect_body_one", { email: connection.email })}
            </p>
            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                onClick={() => disconnect(false)}
                disabled={pending}
                className="transition-base w-full rounded-xl border border-line-strong px-4 py-3 text-left hover:bg-surface disabled:opacity-50"
              >
                <span className="block text-[13.5px] font-medium text-ink">
                  {t("disconnect_keep")}
                </span>
                <span className="mt-0.5 block text-[12px] text-ink-muted">
                  {t("disconnect_keep_desc")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => disconnect(true)}
                disabled={pending}
                className="transition-base w-full rounded-xl border border-claret/30 px-4 py-3 text-left hover:bg-claret/5 disabled:opacity-50"
              >
                <span className="block text-[13.5px] font-medium text-claret">
                  {t("disconnect_delete")}
                </span>
                <span className="mt-0.5 block text-[12px] text-ink-muted">
                  {t("disconnect_delete_desc")}
                </span>
              </button>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setDisconnectOpen(false)}
                disabled={pending}
                className="transition-base text-[12.5px] text-ink-faint hover:text-ink disabled:opacity-50"
              >
                {pending ? t("disconnecting") : t("consent_cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
