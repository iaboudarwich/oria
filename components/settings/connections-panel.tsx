import { getTranslations } from "next-intl/server";
import {
  listGmailConnections,
  getConnectionItemCounts,
  getConnectionFilters,
  getAutoRoutePreference,
  type ConnectionFilterConfig,
} from "@/lib/integrations/gmail/connections";
import { isGmailOAuthConfigured } from "@/lib/integrations/gmail/oauth";
import { isTokenCryptoConfigured } from "@/lib/security/token-crypto";
import { GmailConnectButton } from "./gmail-connect-button";
import { GmailConnectionCard } from "./gmail-connection-card";
import { GmailRoutePref } from "./gmail-route-pref";
import { GmailScanAllButton } from "./gmail-scan-all-button";

const DEFAULT_FILTERS: ConnectionFilterConfig = {
  excludeKeywords: [],
  excludeSenders: [],
  excludeWithAttachments: false,
  workspaceRouting: "personal",
};

/**
 * Settings -> Connections. A user can connect several Gmail accounts; each is
 * rendered as its own card with independent controls. Server-rendered; the
 * cards handle their own actions on the client.
 */
export async function ConnectionsPanel({
  userId,
  notice,
}: {
  userId: string;
  notice?: string;
}) {
  const connections = await listGmailConnections(userId);
  const configured = isGmailOAuthConfigured() && isTokenCryptoConfigured();
  const t = await getTranslations("connections");

  const [routePref, perConnection] = connections.length
    ? await Promise.all([
        getAutoRoutePreference(userId),
        Promise.all(
          connections.map(async (c) => ({
            connection: c,
            counts: await getConnectionItemCounts(c.id),
            filters: (await getConnectionFilters(c.id)) ?? DEFAULT_FILTERS,
          })),
        ),
      ])
    : ["auto_confident" as const, []];

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">{t("title")}</h2>
          <p className="mt-1 text-[13px] text-ink-muted">{t("subtitle")}</p>
        </div>
        {connections.length > 0 ? <GmailScanAllButton /> : null}
      </div>

      {notice === "already_connected" ? (
        <p className="rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] text-ink-muted">
          {t("already_connected")}
        </p>
      ) : null}

      {connections.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface-raised p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-ink">{t("gmail")}</p>
              <p className="mt-0.5 text-[13px] text-ink-muted">{t("not_connected")}</p>
            </div>
            <GmailConnectButton configured={configured} label={t("connect")} />
          </div>
          {!configured ? (
            <p className="mt-3 text-[12px] text-ink-faint">{t("not_configured")}</p>
          ) : null}
        </div>
      ) : (
        <>
          <GmailRoutePref initial={routePref} />
          {perConnection.map(({ connection, counts, filters }) => (
            <GmailConnectionCard
              key={connection.id}
              connection={{
                id: connection.id,
                email: connection.email,
                status: connection.status,
                lastSyncedAt: connection.lastSyncedAt,
              }}
              counts={counts}
              filters={filters}
            />
          ))}
          <div>
            <GmailConnectButton
              configured={configured}
              variant="secondary"
              label={t("connect_another")}
            />
          </div>
        </>
      )}
    </section>
  );
}
