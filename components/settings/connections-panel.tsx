import { getTranslations } from "next-intl/server";
import {
  getGmailConnection,
  getGmailItemCounts,
  getAutoRoutePreference,
  getConnectionFilters,
} from "@/lib/integrations/gmail/connections";
import { getLatestScanJob } from "@/lib/integrations/gmail/scan";
import { isGmailOAuthConfigured } from "@/lib/integrations/gmail/oauth";
import { isTokenCryptoConfigured } from "@/lib/security/token-crypto";
import { GmailCard } from "./gmail-card";
import { GmailFilters } from "./gmail-filters";

/**
 * Settings -> Connections. Currently one provider (Gmail). Server-rendered;
 * the card handles the consent modal, pause/resume, and disconnect on the
 * client.
 */
export async function ConnectionsPanel({ userId }: { userId: string }) {
  const summary = await getGmailConnection(userId);
  const [counts, routePref, filters, lastJob] = summary
    ? await Promise.all([
        getGmailItemCounts(userId),
        getAutoRoutePreference(userId),
        getConnectionFilters(userId),
        getLatestScanJob(userId),
      ])
    : [{ pending: 0, approved: 0 }, "auto_confident" as const, null, null];
  const configured = isGmailOAuthConfigured() && isTokenCryptoConfigured();
  const t = await getTranslations("connections");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{t("title")}</h2>
        <p className="mt-1 text-[13px] text-ink-muted">{t("subtitle")}</p>
      </div>
      <GmailCard
        configured={configured}
        counts={counts}
        routePref={routePref}
        summary={
          summary
            ? {
                email: summary.email,
                status: summary.status,
                lastSyncedAt: summary.lastSyncedAt,
                connectedAt: summary.connectedAt,
              }
            : null
        }
      />
      {summary && filters ? (
        <div className="rounded-2xl border border-line bg-surface-raised p-5">
          <h3 className="text-[14px] font-semibold text-ink">{t("filter_title")}</h3>
          <p className="mt-1 text-[12.5px] text-ink-muted">{t("filter_subtitle")}</p>
          {lastJob && lastJob.emailsSkipped > 0 ? (
            <p className="mt-2 text-[12px] text-ink-faint">
              {t("filter_skipped_summary", { count: lastJob.emailsSkipped })}
            </p>
          ) : null}
          <GmailFilters initial={filters} />
        </div>
      ) : null}
    </section>
  );
}
