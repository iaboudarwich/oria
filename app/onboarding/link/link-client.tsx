"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Wordmark } from "@/components/brand/wordmark";

type Connector = { id: string; name: string; live?: boolean };

// Gmail is live (existing OAuth). The rest are visible-but-coming-soon so the
// user sees the ambition. Names are brand proper nouns; descriptions localize.
const CONNECTORS: Connector[] = [
  { id: "gmail", name: "Gmail", live: true },
  { id: "gcal", name: "Google Calendar" },
  { id: "gdrive", name: "Google Drive" },
  { id: "gdocs", name: "Google Docs" },
  { id: "gsheets", name: "Google Sheets" },
  { id: "gslides", name: "Google Slides" },
  { id: "outlook", name: "Microsoft Outlook" },
  { id: "onedrive", name: "Microsoft OneDrive" },
  { id: "word", name: "Word" },
  { id: "excel", name: "Excel" },
  { id: "powerpoint", name: "PowerPoint" },
  { id: "banking", name: "Banking" },
];

/**
 * Link-everything step. Gmail connects via the existing OAuth flow (its first
 * scan kicks off in the callback); everything else is shown with a clear
 * "coming soon" badge. Either action proceeds to the reveal on the dashboard.
 */
export function LinkClient({ gmailConnected }: { gmailConnected: boolean }) {
  const t = useTranslations("onboarding");
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex items-center justify-between px-6 py-5 sm:px-8">
        <Wordmark />
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-[13px] text-ink-muted transition-base hover:text-ink"
        >
          {t("link_skip")}
        </button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-4 pb-16">
        <h1 className="text-[24px] font-semibold tracking-tight text-ink sm:text-[28px]">
          {t("link_title")}
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">{t("link_subtitle")}</p>

        <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
          {CONNECTORS.map((c) => {
            const connected = c.id === "gmail" && gmailConnected;
            const body = (
              <div className="flex h-full items-start justify-between gap-3 rounded-2xl border border-line bg-surface-raised p-4">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink">{c.name}</p>
                  <p className="mt-0.5 text-[12px] text-ink-muted">{t(`link_desc_${c.id}`)}</p>
                </div>
                <span className="shrink-0">
                  {connected ? (
                    <span className="rounded-md bg-sage/15 px-2 py-0.5 text-[11px] font-medium text-[#3f5240]">
                      {t("link_connected")}
                    </span>
                  ) : c.live ? (
                    <span className="rounded-md bg-ink px-2 py-0.5 text-[11px] font-medium text-surface">
                      {t("link_connect")}
                    </span>
                  ) : (
                    <span className="rounded-md border border-line px-2 py-0.5 text-[11px] text-ink-faint">
                      {t("link_coming_soon")}
                    </span>
                  )}
                </span>
              </div>
            );
            if (c.live && !connected) {
              return (
                <a key={c.id} href="/api/oauth/gmail/start" className="block">
                  {body}
                </a>
              );
            }
            return (
              <div key={c.id} className={c.live ? "" : "opacity-70"}>
                {body}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="mt-7 w-full rounded-xl bg-ink px-5 py-3 text-[15px] font-medium text-surface transition-base hover:bg-ink-soft"
        >
          {t("link_done")}
        </button>
      </main>
    </div>
  );
}
