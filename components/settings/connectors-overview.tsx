import { getTranslations } from "next-intl/server";
import { listGmailConnections } from "@/lib/integrations/gmail/connections";
import { listOutlookConnections } from "@/lib/microsoft/connections";
import { listCloudConnectionsByService } from "@/lib/google/cloud-connections";

/**
 * At-a-glance connector grid at the top of the Connections tab (Round 14 F2).
 * Every supported connector is visible without scrolling, each with a status
 * (connected / available / coming soon). The rich management panels below stay
 * the source of truth for connect/pause/disconnect; this grid is the overview
 * and a fast path to a not-yet-connected service (e.g. Outlook) that previously
 * required scrolling past the connected panels to find.
 */
type Connector = {
  id: string;
  name: string; // brand proper noun, not translated
  descKey: string;
  connectHref?: string; // omitted => coming soon
  connected: boolean;
};

export async function ConnectorsOverview({ userId }: { userId: string }) {
  const t = await getTranslations("connectors");
  const [gmail, outlookMail, cal, drive, onedrive, ocal] = await Promise.all([
    listGmailConnections(userId),
    listOutlookConnections(userId),
    listCloudConnectionsByService(userId, "calendar"),
    listCloudConnectionsByService(userId, "drive"),
    listCloudConnectionsByService(userId, "onedrive"),
    listCloudConnectionsByService(userId, "outlook_calendar"),
  ]);
  const has = (arr: { length: number }) => arr.length > 0;

  const connectors: Connector[] = [
    { id: "gmail", name: "Gmail", descKey: "gmail_desc", connectHref: "/api/oauth/gmail/start", connected: has(gmail) },
    { id: "gcal", name: "Google Calendar", descKey: "gcal_desc", connectHref: "/api/oauth/google/connect?service=calendar", connected: has(cal) },
    { id: "gdrive", name: "Google Drive", descKey: "gdrive_desc", connectHref: "/api/oauth/google/connect?service=drive", connected: has(drive) },
    { id: "outlook", name: "Outlook", descKey: "outlook_desc", connectHref: "/api/oauth/microsoft/connect?service=mail", connected: has(outlookMail) },
    { id: "ocal", name: "Outlook Calendar", descKey: "ocal_desc", connectHref: "/api/oauth/microsoft/connect?service=calendar", connected: has(ocal) },
    { id: "onedrive", name: "OneDrive", descKey: "onedrive_desc", connectHref: "/api/oauth/microsoft/connect?service=onedrive", connected: has(onedrive) },
    { id: "banking", name: "Banking", descKey: "banking_desc", connected: false },
  ];

  return (
    <section>
      <h2 className="mb-1 px-1 text-[15px] font-semibold text-ink">{t("overview_title")}</h2>
      <p className="mb-3 px-1 text-[13px] text-ink-muted">{t("overview_desc")}</p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {connectors.map((c) => {
          const comingSoon = !c.connectHref;
          return (
            <li
              key={c.id}
              className="flex flex-col rounded-xl border border-line bg-surface-raised p-3"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    c.connected ? "bg-sage" : comingSoon ? "bg-line-strong" : "bg-ink-faint/40"
                  }`}
                  aria-hidden
                />
                <span className="truncate text-[12.5px] font-medium text-ink">{c.name}</span>
              </div>
              <span className="mt-1 line-clamp-2 text-[11px] text-ink-faint">{t(c.descKey)}</span>
              <div className="mt-2">
                {c.connected ? (
                  <span className="inline-flex items-center rounded-md bg-sage/12 px-2 py-0.5 text-[10.5px] font-medium text-sage">
                    {t("status_connected")}
                  </span>
                ) : comingSoon ? (
                  <span className="inline-flex items-center rounded-md bg-canvas px-2 py-0.5 text-[10.5px] text-ink-faint">
                    {t("status_soon")}
                  </span>
                ) : (
                  <a
                    href={c.connectHref}
                    className="inline-flex items-center rounded-md border border-line px-2 py-0.5 text-[10.5px] font-medium text-ink transition-base hover:border-line-strong"
                  >
                    {t("status_connect")}
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
