import { getTranslations } from "next-intl/server";
import { listOutlookConnections } from "@/lib/microsoft/connections";
import {
  listCloudConnectionsByService,
  type CloudConnectionSummary,
} from "@/lib/google/cloud-connections";
import { listUserSpaces } from "@/lib/data/organizations";
import { isMicrosoftOAuthConfigured } from "@/lib/microsoft/oauth";
import { isTokenCryptoConfigured } from "@/lib/security/token-crypto";
import {
  CloudConnectionRow,
  type SpaceChoice,
  type CloudRowLabels,
} from "./cloud-connection-row";
import { OutlookMailRow, type OutlookMailLabels } from "./outlook-mail-row";

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
 * Settings -> Connections: the Microsoft services hub (Outlook mail, Outlook
 * Calendar, OneDrive), grouped by account email. Each account shows which
 * services are connected with connect links for the missing ones (login_hint
 * pre-selects the account via incremental consent), plus status, routing,
 * pause/resume, and disconnect.
 */
export async function MicrosoftServicesPanel({ userId }: { userId: string }) {
  if (!isMicrosoftOAuthConfigured() || !isTokenCryptoConfigured()) return null;

  const [mail, calendar, drive, spacesRaw] = await Promise.all([
    listOutlookConnections(userId),
    listCloudConnectionsByService(userId, "outlook_calendar"),
    listCloudConnectionsByService(userId, "onedrive"),
    listUserSpaces(),
  ]);

  const t = await getTranslations("connections");
  const spaces: SpaceChoice[] = spacesRaw.map((s) => ({ id: s.organization.id, name: s.organization.name }));

  const emails = new Set<string>();
  for (const m of mail) emails.add(m.email);
  for (const c of calendar) emails.add(c.accountEmail);
  for (const d of drive) emails.add(d.accountEmail);

  const mailByEmail = new Map(mail.map((m) => [m.email, m]));
  const calByEmail = new Map(calendar.map((c) => [c.accountEmail, c]));
  const driveByEmail = new Map(drive.map((d) => [d.accountEmail, d]));

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
  const mailLabels: OutlookMailLabels = {
    mail: t("svc_mail"),
    statusActive: t("status_active"),
    statusPaused: t("status_paused"),
    statusError: t("status_error"),
    statusRevoked: t("status_revoked"),
    lastSync: t("last_sync", { time: "{time}" }),
    pause: t("pause"),
    resume: t("resume"),
    disconnect: t("disconnect"),
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

  const connectLink = (service: "mail" | "calendar" | "onedrive", email?: string) =>
    `/api/oauth/microsoft/connect?service=${service}${email ? `&email=${encodeURIComponent(email)}` : ""}`;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{t("ms_title")}</h2>
        <p className="mt-1 text-[13px] text-ink-muted">{t("ms_subtitle")}</p>
      </div>

      {Array.from(emails).map((email) => {
        const mailConn = mailByEmail.get(email);
        const cal = calByEmail.get(email);
        const drv = driveByEmail.get(email);
        return (
          <div key={email} className="space-y-2 rounded-2xl border border-line bg-surface-raised p-4">
            <p className="text-[13.5px] font-semibold text-ink">{email}</p>

            {mailConn ? (
              <OutlookMailRow
                view={{ id: mailConn.id, status: mailConn.status, lastSyncLabel: syncedLabel(mailConn.lastSyncedAt) }}
                labels={mailLabels}
              />
            ) : (
              <a href={connectLink("mail", email)} className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12px] text-ink transition-base hover:bg-canvas">
                {t("add_outlook")}
              </a>
            )}

            {cal ? (
              <CloudConnectionRow view={rowView(cal)} spaces={spaces} labels={rowLabels} />
            ) : (
              <a href={connectLink("calendar", email)} className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12px] text-ink transition-base hover:bg-canvas">
                {t("add_outlook_calendar")}
              </a>
            )}

            {drv ? (
              <CloudConnectionRow view={rowView(drv)} spaces={spaces} labels={rowLabels} />
            ) : (
              <a href={connectLink("onedrive", email)} className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12px] text-ink transition-base hover:bg-canvas">
                {t("add_onedrive")}
              </a>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <a href={connectLink("mail")} className="inline-flex h-9 items-center rounded-lg bg-ink px-4 text-[12.5px] font-medium text-surface transition-base hover:bg-ink-soft">
          {t("add_outlook")}
        </a>
        <a href={connectLink("onedrive")} className="inline-flex h-9 items-center rounded-lg bg-ink px-4 text-[12.5px] font-medium text-surface transition-base hover:bg-ink-soft">
          {t("add_onedrive")}
        </a>
        <a href={connectLink("calendar")} className="inline-flex h-9 items-center rounded-lg bg-ink px-4 text-[12.5px] font-medium text-surface transition-base hover:bg-ink-soft">
          {t("add_outlook_calendar")}
        </a>
      </div>
    </section>
  );
}
