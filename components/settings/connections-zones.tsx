import { getTranslations } from "next-intl/server";
import { listGmailConnections } from "@/lib/integrations/gmail/connections";
import { listOutlookConnections } from "@/lib/microsoft/connections";
import { listCloudConnectionsByService } from "@/lib/google/cloud-connections";
import { isGmailOAuthConfigured } from "@/lib/integrations/gmail/oauth";
import { isGoogleOAuthConfigured } from "@/lib/google/oauth";
import { isMicrosoftOAuthConfigured } from "@/lib/microsoft/oauth";
import { isTokenCryptoConfigured } from "@/lib/security/token-crypto";
import { ConnectionsPanel } from "./connections-panel";
import { CloudServicesPanel } from "./cloud-services-panel";
import { MicrosoftServicesPanel } from "./microsoft-services-panel";
import { ConnectButton } from "./connect-privacy-gate";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Settings -> Connections, the two-zone hub (Round 14.5 F1).
 *
 * Zone 1 "Connected": the account-grouped detail panels (Gmail, Google
 * services, Microsoft services), each self-hiding when it has nothing
 * connected. They own status, last sync, routing, re-auth, and disconnect.
 *
 * Zone 2 "Available": a responsive grid of every connector not yet connected,
 * with an Available pill + Connect action, or a Coming soon pill. A connected
 * service drops out of this zone (it lives in Zone 1). Replaces the old
 * overview grid that was bolted on top of the panels.
 */
type AvailableItem = {
  id: string;
  name: string;
  descKey: string;
  available: boolean;
  href?: string;
};

export async function ConnectionsZones({ userId, notice }: { userId: string; notice?: string }) {
  const t = await getTranslations("connectors");
  const crypto = isTokenCryptoConfigured();
  const gmailOk = isGmailOAuthConfigured() && crypto;
  const googleOk = isGoogleOAuthConfigured() && crypto;
  const msOk = isMicrosoftOAuthConfigured() && crypto;

  const [gmail, outlook, cal, drive, ocal, onedrive, ackAt] = await Promise.all([
    listGmailConnections(userId),
    listOutlookConnections(userId),
    listCloudConnectionsByService(userId, "calendar"),
    listCloudConnectionsByService(userId, "drive"),
    listCloudConnectionsByService(userId, "outlook_calendar"),
    listCloudConnectionsByService(userId, "onedrive"),
    readConnectPrivacyAck(userId),
  ]);
  const privacyAcknowledged = ackAt !== null;
  const has = (a: { length: number }) => a.length > 0;
  const anyConnected =
    has(gmail) || has(outlook) || has(cal) || has(drive) || has(ocal) || has(onedrive);

  // Real OAuth connectors that are not connected yet. A provider whose OAuth
  // is not configured is shown as coming soon rather than a dead Connect link.
  const candidates: Array<{ id: string; name: string; descKey: string; connected: boolean; ok: boolean; href: string }> = [
    { id: "gmail", name: "Gmail", descKey: "gmail_desc", connected: has(gmail), ok: gmailOk, href: "/api/oauth/gmail/start" },
    { id: "gcal", name: "Google Calendar", descKey: "gcal_desc", connected: has(cal), ok: googleOk, href: "/api/oauth/google/connect?service=calendar" },
    { id: "gdrive", name: "Google Drive", descKey: "gdrive_desc", connected: has(drive), ok: googleOk, href: "/api/oauth/google/connect?service=drive" },
    { id: "outlook", name: "Outlook", descKey: "outlook_desc", connected: has(outlook), ok: msOk, href: "/api/oauth/microsoft/connect?service=mail" },
    { id: "ocal", name: "Outlook Calendar", descKey: "ocal_desc", connected: has(ocal), ok: msOk, href: "/api/oauth/microsoft/connect?service=calendar" },
    { id: "onedrive", name: "OneDrive", descKey: "onedrive_desc", connected: has(onedrive), ok: msOk, href: "/api/oauth/microsoft/connect?service=onedrive" },
  ];

  const real: AvailableItem[] = candidates
    .filter((c) => !c.connected)
    .map((c) => ({ id: c.id, name: c.name, descKey: c.descKey, available: c.ok, href: c.ok ? c.href : undefined }));

  // Always-visible coming-soon connectors.
  const soon: AvailableItem[] = [
    { id: "whoop", name: "WHOOP", descKey: "whoop_desc", available: false },
    { id: "banking", name: "Banking", descKey: "banking_desc", available: false },
  ];

  // Available first, coming soon last.
  const items = [...real.filter((i) => i.available), ...real.filter((i) => !i.available), ...soon];

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <p className="text-eyebrow">{t("connected")}</p>
        {anyConnected ? (
          <div className="space-y-4">
            <ConnectionsPanel userId={userId} notice={notice} />
            <CloudServicesPanel userId={userId} />
            <MicrosoftServicesPanel userId={userId} />
          </div>
        ) : (
          <p className="text-[13px] text-ink-muted">{t("none_connected")}</p>
        )}
      </section>

      <section className="space-y-4">
        <p className="text-eyebrow">{t("available")}</p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col justify-between rounded-2xl border border-line bg-surface-raised p-4"
            >
              <div>
                <span className="block text-[13.5px] font-medium text-ink">{item.name}</span>
                <span className="mt-1 block text-[12px] leading-snug text-ink-faint">{t(item.descKey)}</span>
              </div>
              <div className="mt-3">
                {item.available && item.href ? (
                  <ConnectButton
                    href={item.href}
                    acknowledged={privacyAcknowledged}
                    label={t("connect")}
                  />
                ) : (
                  <span className="inline-flex items-center rounded-md bg-canvas px-2 py-1 text-[11px] text-ink-faint">
                    {t("soon")}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Whether the user has acknowledged the privacy step before connecting. */
async function readConnectPrivacyAck(userId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("connect_privacy_ack_at")
      .eq("id", userId)
      .maybeSingle();
    return (data?.connect_privacy_ack_at as string | null) ?? null;
  } catch {
    return null;
  }
}
