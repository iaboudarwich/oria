import { getTranslations } from "next-intl/server";
import { listGmailConnections } from "@/lib/integrations/gmail/connections";
import {
  listCloudConnectionsByService,
  type CloudConnectionSummary,
} from "@/lib/google/cloud-connections";
import { listUserSpaces } from "@/lib/data/organizations";
import { isGoogleOAuthConfigured } from "@/lib/google/oauth";
import { isTokenCryptoConfigured } from "@/lib/security/token-crypto";
import {
  CloudConnectionRow,
  type SpaceChoice,
  type CloudRowLabels,
} from "./cloud-connection-row";

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
 * Settings -> Connections: the Google services hub (Calendar + Drive), grouped
 * by account email. Gmail keeps its own richer card above this; here each
 * account shows which of Calendar/Drive are connected, with connect links for
 * the missing ones (login_hint pre-selects the account) plus per-service
 * status, routing, pause/resume, and disconnect.
 */
export async function CloudServicesPanel({ userId }: { userId: string }) {
  const configured = isGoogleOAuthConfigured() && isTokenCryptoConfigured();
  if (!configured) return null;

  const [gmail, calendar, drive, spacesRaw] = await Promise.all([
    listGmailConnections(userId),
    listCloudConnectionsByService(userId, "calendar"),
    listCloudConnectionsByService(userId, "drive"),
    listUserSpaces(),
  ]);

  const t = await getTranslations("connections");
  const spaces: SpaceChoice[] = spacesRaw.map((s) => ({
    id: s.organization.id,
    name: s.organization.name,
  }));

  // Group every Google account email across all services.
  const emails = new Set<string>();
  for (const g of gmail) emails.add(g.email);
  for (const c of calendar) emails.add(c.accountEmail);
  for (const d of drive) emails.add(d.accountEmail);

  const calByEmail = new Map(calendar.map((c) => [c.accountEmail, c]));
  const driveByEmail = new Map(drive.map((d) => [d.accountEmail, d]));
  const mailEmails = new Set(gmail.map((g) => g.email));

  const rowLabels: CloudRowLabels = {
    serviceCalendar: t("svc_calendar"),
    serviceDrive: t("svc_drive"),
    statusActive: t("status_active"),
    statusPaused: t("status_paused"),
    statusError: t("status_error"),
    statusRevoked: t("status_revoked"),
    lastSync: t("last_sync", { time: "{time}" }),
    pause: t("pause"),
    resume: t("resume"),
    disconnect: t("disconnect"),
    routeAuto: t("route_mode_auto"),
    routeFixed: t("route_mode_fixed"),
  };

  function rowView(conn: CloudConnectionSummary) {
    return {
      id: conn.id,
      service: conn.service,
      status: conn.status,
      routingMode: conn.routingMode,
      routingTargetOrgId: conn.routingTargetOrgIds[0] ?? null,
      lastSyncLabel: syncedLabel(conn.lastSyncAt),
    };
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{t("cloud_title")}</h2>
        <p className="mt-1 text-[13px] text-ink-muted">{t("cloud_subtitle")}</p>
      </div>

      {Array.from(emails).map((email) => {
        const cal = calByEmail.get(email);
        const drv = driveByEmail.get(email);
        const hasMail = mailEmails.has(email);
        return (
          <div key={email} className="space-y-2 rounded-2xl border border-line bg-surface-raised p-4">
            <p className="text-[13.5px] font-semibold text-ink">{email}</p>

            {/* Mail chip (managed by the Gmail card above). */}
            <div className="flex items-center gap-2 text-[12px] text-ink-muted">
              <span className="font-medium text-ink">{t("svc_mail")}</span>
              <span className="text-ink-faint">{hasMail ? t("mail_managed") : t("svc_not_connected")}</span>
            </div>

            {cal ? (
              <CloudConnectionRow view={rowView(cal)} spaces={spaces} labels={rowLabels} />
            ) : (
              <a
                href={`/api/oauth/google/connect?service=calendar&email=${encodeURIComponent(email)}`}
                className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12px] text-ink transition-base hover:bg-canvas"
              >
                {t("add_calendar")}
              </a>
            )}

            {drv ? (
              <CloudConnectionRow view={rowView(drv)} spaces={spaces} labels={rowLabels} />
            ) : (
              <a
                href={`/api/oauth/google/connect?service=drive&email=${encodeURIComponent(email)}`}
                className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12px] text-ink transition-base hover:bg-canvas"
              >
                {t("add_drive")}
              </a>
            )}
          </div>
        );
      })}

      {/* Connect services on a new account. */}
      <div className="flex flex-wrap gap-2">
        <a
          href="/api/oauth/google/connect?service=calendar"
          className="inline-flex h-9 items-center rounded-lg bg-ink px-4 text-[12.5px] font-medium text-surface transition-base hover:bg-ink-soft"
        >
          {t("add_calendar")}
        </a>
        <a
          href="/api/oauth/google/connect?service=drive"
          className="inline-flex h-9 items-center rounded-lg bg-ink px-4 text-[12.5px] font-medium text-surface transition-base hover:bg-ink-soft"
        >
          {t("add_drive")}
        </a>
      </div>

      <p className="text-[12px] text-ink-faint">{t("microsoft_soon")}</p>
    </section>
  );
}
