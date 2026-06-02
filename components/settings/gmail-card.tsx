"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { setGmailPaused } from "@/lib/integrations/gmail/connection-actions";

export type GmailCardSummary = {
  email: string;
  status: "active" | "paused" | "revoked" | "error";
  lastSyncedAt: string | null;
  connectedAt: string;
} | null;

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
 * The Gmail connection card. Not connected: a privacy-forward consent modal
 * then a one-click OAuth start. Connected: status + a one-click disconnect.
 */
export function GmailCard({
  summary,
  configured,
  counts,
}: {
  summary: GmailCardSummary;
  configured: boolean;
  counts: { pending: number; approved: number };
}) {
  const t = useTranslations("connections");
  const router = useRouter();
  const [consentOpen, setConsentOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function disconnect(deleteData: boolean) {
    startTransition(async () => {
      await fetch("/api/connections/gmail/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteData }),
      });
      setDisconnectOpen(false);
      router.refresh();
    });
  }

  function togglePause() {
    if (!summary) return;
    const next = summary.status !== "paused";
    startTransition(async () => {
      await setGmailPaused(next);
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised p-5 shadow-[0_1px_2px_rgba(28,26,23,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">{t("gmail")}</p>
          {summary ? (
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {t("connected_as", { email: summary.email })}
            </p>
          ) : (
            <p className="mt-0.5 text-[13px] text-ink-muted">{t("not_connected")}</p>
          )}
          {summary ? (
            <p className="mt-1 text-[11.5px] text-ink-faint">
              {t(`status_${summary.status}`)}
              {summary.lastSyncedAt
                ? ` · ${t("last_sync", { time: relativeTime(summary.lastSyncedAt) })}`
                : ""}
            </p>
          ) : null}
          {summary ? (
            <p className="mt-1.5 text-[12px] text-ink-muted">
              {t("items_summary", { pending: counts.pending, approved: counts.approved })}
            </p>
          ) : null}
        </div>

        {summary ? (
          <div className="flex shrink-0 items-center gap-2">
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
              onClick={togglePause}
              disabled={pending}
              className="inline-flex h-8 items-center rounded-lg border border-line-strong px-3 text-[12px] font-medium text-ink transition-base hover:bg-surface disabled:opacity-50"
            >
              {summary.status === "paused" ? t("resume") : t("pause")}
            </button>
            <button
              type="button"
              onClick={() => setDisconnectOpen(true)}
              disabled={pending}
              className="inline-flex h-8 items-center rounded-lg border border-line-strong px-3 text-[12px] font-medium text-claret transition-base hover:bg-claret/5 disabled:opacity-50"
            >
              {t("disconnect")}
            </button>
          </div>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setConsentOpen(true)}
            disabled={!configured}
          >
            {t("connect")}
          </Button>
        )}
      </div>

      {!configured && !summary ? (
        <p className="mt-3 text-[12px] text-ink-faint">{t("not_configured")}</p>
      ) : null}

      {consentOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gmail-consent-title"
          className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6"
        >
          <div
            aria-hidden
            onClick={() => setConsentOpen(false)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm animate-fade-in"
          />
          <div className="relative z-[121] w-full max-w-md rounded-2xl border border-line bg-surface-raised p-6 shadow-xl animate-scale-in">
            <h2 id="gmail-consent-title" className="text-title text-ink">
              {t("consent_title")}
            </h2>
            <p className="mt-3 text-body text-ink-soft">{t("consent_body")}</p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConsentOpen(false)}
                className="text-[12.5px] text-ink-faint transition-base hover:text-ink"
              >
                {t("consent_cancel")}
              </button>
              {/* Plain anchor (no Link prefetch) so the OAuth start route is
                  only hit on an actual click, never on prefetch. */}
              <a
                href="/api/oauth/gmail/start"
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-ink px-4 text-[13.5px] font-medium text-surface transition-base hover:bg-ink-soft"
              >
                {t("consent_continue")}
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {disconnectOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gmail-disconnect-title"
          className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6"
        >
          <div
            aria-hidden
            onClick={() => !pending && setDisconnectOpen(false)}
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm animate-fade-in"
          />
          <div className="relative z-[121] w-full max-w-md rounded-2xl border border-line bg-surface-raised p-6 shadow-xl animate-scale-in">
            <h2 id="gmail-disconnect-title" className="text-title text-ink">
              {t("disconnect_title")}
            </h2>
            <p className="mt-3 text-body text-ink-soft">{t("disconnect_body")}</p>
            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                onClick={() => disconnect(false)}
                disabled={pending}
                className="w-full rounded-xl border border-line-strong px-4 py-3 text-left transition-base hover:bg-surface disabled:opacity-50"
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
                className="w-full rounded-xl border border-claret/30 px-4 py-3 text-left transition-base hover:bg-claret/5 disabled:opacity-50"
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
                className="text-[12.5px] text-ink-faint transition-base hover:text-ink disabled:opacity-50"
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
