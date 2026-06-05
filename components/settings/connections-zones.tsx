import { getTranslations } from "next-intl/server";
import { listGmailConnections } from "@/lib/integrations/gmail/connections";
import { listOutlookConnections } from "@/lib/microsoft/connections";
import { listCloudConnectionsByService } from "@/lib/google/cloud-connections";
import { isGmailOAuthConfigured } from "@/lib/integrations/gmail/oauth";
import { isGoogleOAuthConfigured } from "@/lib/google/oauth";
import { isMicrosoftOAuthConfigured } from "@/lib/microsoft/oauth";
import { listWhoopConnections } from "@/lib/whoop/connections";
import { isTokenCryptoConfigured } from "@/lib/security/token-crypto";
import { ConnectionsPanel } from "./connections-panel";
import { CloudServicesPanel } from "./cloud-services-panel";
import { MicrosoftServicesPanel } from "./microsoft-services-panel";
import { WhoopPanel } from "./whoop-panel";
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
  /** Per-space connectors feed a scope; WHOOP is the user's own data. */
  scoped: boolean;
};

export async function ConnectionsZones({
  userId,
  notice,
  scope,
}: {
  userId: string;
  notice?: string;
  scope: { id: string; name: string; kind: string };
}) {
  const t = await getTranslations("connectors");
  const ts = await getTranslations("settingsScope");
  const crypto = isTokenCryptoConfigured();
  const gmailOk = isGmailOAuthConfigured() && crypto;
  const googleOk = isGoogleOAuthConfigured() && crypto;
  const msOk = isMicrosoftOAuthConfigured() && crypto;

  const [gmail, outlook, cal, drive, ocal, onedrive, whoop, ackAt] = await Promise.all([
    listGmailConnections(userId),
    listOutlookConnections(userId),
    listCloudConnectionsByService(userId, "calendar"),
    listCloudConnectionsByService(userId, "drive"),
    listCloudConnectionsByService(userId, "outlook_calendar"),
    listCloudConnectionsByService(userId, "onedrive"),
    listWhoopConnections(userId),
    readConnectPrivacyAck(userId),
  ]);
  const privacyAcknowledged = ackAt !== null;
  const has = (a: { length: number }) => a.length > 0;
  const anyConnected =
    has(gmail) || has(outlook) || has(cal) || has(drive) || has(ocal) || has(onedrive) || has(whoop);

  // Real OAuth connectors that are not connected yet. A provider whose OAuth
  // is not configured is shown as coming soon rather than a dead Connect link.
  const candidates: Array<{ id: string; name: string; descKey: string; connected: boolean; ok: boolean; href: string }> = [
    { id: "gmail", name: "Gmail", descKey: "gmail_desc", connected: has(gmail), ok: gmailOk, href: "/api/oauth/gmail/start" },
    { id: "gcal", name: "Google Calendar", descKey: "gcal_desc", connected: has(cal), ok: googleOk, href: "/api/oauth/google/connect?service=calendar" },
    { id: "gdrive", name: "Google Drive", descKey: "gdrive_desc", connected: has(drive), ok: googleOk, href: "/api/oauth/google/connect?service=drive" },
    { id: "outlook", name: "Outlook", descKey: "outlook_desc", connected: has(outlook), ok: msOk, href: "/api/oauth/microsoft/connect?service=mail" },
    { id: "ocal", name: "Outlook Calendar", descKey: "ocal_desc", connected: has(ocal), ok: msOk, href: "/api/oauth/microsoft/connect?service=calendar" },
    { id: "onedrive", name: "OneDrive", descKey: "onedrive_desc", connected: has(onedrive), ok: msOk, href: "/api/oauth/microsoft/connect?service=onedrive" },
    // WHOOP is a live Connect everywhere, same flow as the Health surface. The
    // start route handles a config gap gracefully (plain message), so we never
    // show it as "Soon". Health data is the user's own (user_id-scoped, never
    // shared into a circle or work space), so no per-space gating is needed.
    { id: "whoop", name: "WHOOP", descKey: "whoop_desc", connected: has(whoop), ok: true, href: "/api/oauth/whoop/start" },
  ];

  // WHOOP is the user's own data (no scope); every other connector feeds the
  // selected scope, so its Connect carries ?org=<scope> and names the scope.
  const real: AvailableItem[] = candidates
    .filter((c) => !c.connected)
    .map((c) => {
      const scoped = c.id !== "whoop";
      const href =
        c.ok && c.href
          ? scoped
            ? `${c.href}${c.href.includes("?") ? "&" : "?"}org=${scope.id}`
            : c.href
          : undefined;
      return { id: c.id, name: c.name, descKey: c.descKey, available: c.ok, href, scoped };
    });

  // Always-visible coming-soon connectors.
  const soon: AvailableItem[] = [
    { id: "banking", name: "Banking", descKey: "banking_desc", available: false, scoped: true },
  ];

  // Available first, coming soon last.
  const items = [...real.filter((i) => i.available), ...real.filter((i) => !i.available), ...soon];

  return (
    <div className="space-y-12">
      {/* Connect-outcome banner. The managed-tenant case (a Microsoft work or
          school account that needs admin approval) gets a prominent plain
          message + the personal-account path; raw Microsoft errors are never
          shown. */}
      {notice === "outlook_admin_consent" ? (
        <div className="rounded-2xl border border-warning/40 bg-warning-soft px-4 py-3">
          <p className="text-[13.5px] font-semibold text-ink">{t("notice_admin_consent_title")}</p>
          <p className="mt-1 text-[12.5px] text-ink-muted">{t("notice_admin_consent_body")}</p>
        </div>
      ) : notice === "outlook_failed" ? (
        <p className="rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] text-ink-muted">
          {t("notice_outlook_failed")}
        </p>
      ) : notice === "outlook_unavailable" ? (
        <p className="rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] text-ink-muted">
          {t("notice_outlook_unavailable")}
        </p>
      ) : null}

      <section className="space-y-4">
        <p className="text-eyebrow">{t("connected")}</p>
        {anyConnected ? (
          <div className="space-y-4">
            <ConnectionsPanel userId={userId} notice={notice} />
            <CloudServicesPanel userId={userId} />
            <MicrosoftServicesPanel userId={userId} />
            <WhoopPanel userId={userId} />
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
                    /* Just "Connect": the scope is shown by the "Applies to
                       {scope}" pill above and named again in the confirm dialog,
                       so repeating it on every card was redundant and overflowed. */
                    label={t("connect")}
                    confirm={{
                      title: item.scoped
                        ? ts("confirm_title", { scope: scope.name })
                        : ts("confirm_title_account", { name: item.name }),
                      body: item.scoped
                        ? ts("confirm_body", { name: item.name, scope: scope.name })
                        : ts("confirm_body_account", { name: item.name }),
                      continueLabel: ts("continue"),
                      cancelLabel: ts("cancel"),
                    }}
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
