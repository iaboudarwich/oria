import { getTranslations } from "next-intl/server";
import {
  listGmailConnections,
  getConnectionItemCounts,
  getConnectionFilters,
  getAutoRoutePreference,
  type ConnectionFilterConfig,
} from "@/lib/integrations/gmail/connections";
import { listUserSpaces } from "@/lib/data/organizations";
import { isGmailOAuthConfigured } from "@/lib/integrations/gmail/oauth";
import { isTokenCryptoConfigured } from "@/lib/security/token-crypto";
import { GmailConnectButton } from "./gmail-connect-button";
import { GmailConnectionCard } from "./gmail-connection-card";
import { GmailRoutePref } from "./gmail-route-pref";
import { GmailScanAllButton } from "./gmail-scan-all-button";
import type { SpaceOption } from "./gmail-filters";

const DEFAULT_FILTERS: ConnectionFilterConfig = {
  excludeKeywords: [],
  excludeSenders: [],
  excludeWithAttachments: false,
  workspaceRouting: "auto",
  routingMode: "auto",
  routingTargetOrgIds: [],
};

const STATUS_DOT: Record<string, string> = {
  active: "bg-sage",
  paused: "bg-ink-faint",
  revoked: "bg-claret",
  error: "bg-claret",
};

function syncedLabel(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

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

  const [routePref, perConnection, spacesRaw] = connections.length
    ? await Promise.all([
        getAutoRoutePreference(userId),
        Promise.all(
          connections.map(async (c) => ({
            connection: c,
            counts: await getConnectionItemCounts(c.id),
            filters: (await getConnectionFilters(c.id)) ?? DEFAULT_FILTERS,
          })),
        ),
        listUserSpaces(),
      ])
    : ["auto_confident" as const, [], []];

  const spaces: SpaceOption[] = spacesRaw.map((s) => ({
    id: s.organization.id,
    name: s.organization.name,
    kind: s.organization.kind,
  }));

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
          {/* Status strip: an at-a-glance health row per connected inbox. */}
          <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised">
            {perConnection.map(({ connection, counts }, i) => (
              <div
                key={connection.id}
                className={`flex items-center gap-3 px-4 py-2.5 text-[12.5px] ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[connection.status] ?? "bg-ink-faint"}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-ink">{connection.email}</span>
                <span className="shrink-0 text-ink-faint">
                  {t(`status_${connection.status}`)} · {t("last_sync", { time: syncedLabel(connection.lastSyncedAt) })}
                </span>
                {counts.pending > 0 ? (
                  <span className="shrink-0 rounded-full bg-ink px-1.5 text-[10.5px] font-semibold text-surface">
                    {counts.pending}
                  </span>
                ) : null}
              </div>
            ))}
          </div>

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
              spaces={spaces}
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
