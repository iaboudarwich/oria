"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Wordmark } from "@/components/brand/wordmark";
import { ConnectionModal } from "@/components/ai/connection-modal";
import { CheckIcon, CloseIcon } from "@/components/ui/icon";
import { acknowledgeConnectPrivacy } from "@/lib/data/connect-privacy-actions";
import type { ProviderName } from "@/lib/ai-providers";

const AI_PROVIDER_NAME: Record<string, string> = {
  anthropic: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
};

type Connector = {
  id: string;
  name: string;
  live?: boolean;
  href?: string;
  // Office-type connectors come through a parent file service: they light up
  // once that service is connected (Docs/Sheets/Slides via Drive; Word/Excel/
  // PowerPoint via OneDrive).
  via?: "drive" | "onedrive";
};

// Google (Gmail, Calendar, Drive) and Microsoft (Outlook, OneDrive) are live.
// Office formats light up via their parent file service. Banking stays
// coming-soon so the user sees the ambition.
const CONNECTORS: Connector[] = [
  { id: "gmail", name: "Gmail", live: true, href: "/api/oauth/gmail/start" },
  { id: "gcal", name: "Google Calendar", live: true, href: "/api/oauth/google/connect?service=calendar" },
  { id: "gdrive", name: "Google Drive", live: true, href: "/api/oauth/google/connect?service=drive" },
  { id: "gdocs", name: "Google Docs", via: "drive" },
  { id: "gsheets", name: "Google Sheets", via: "drive" },
  { id: "gslides", name: "Google Slides", via: "drive" },
  { id: "outlook", name: "Microsoft Outlook", live: true, href: "/api/oauth/microsoft/connect?service=mail" },
  { id: "onedrive", name: "Microsoft OneDrive", live: true, href: "/api/oauth/microsoft/connect?service=onedrive" },
  { id: "word", name: "Word", via: "onedrive" },
  { id: "excel", name: "Excel", via: "onedrive" },
  { id: "powerpoint", name: "PowerPoint", via: "onedrive" },
  { id: "banking", name: "Banking" },
];

/**
 * Link-everything step. Google and Microsoft mail/file/calendar connect via
 * OAuth; the Office-format cards light up once their parent file service is
 * connected. Banking is "coming soon". Either action proceeds to the reveal.
 */
export function LinkClient({
  gmailConnected,
  calendarConnected,
  driveConnected,
  outlookConnected,
  onedriveConnected,
  aiProvider,
  privacyAcknowledged,
}: {
  gmailConnected: boolean;
  calendarConnected: boolean;
  driveConnected: boolean;
  outlookConnected: boolean;
  onedriveConnected: boolean;
  aiProvider: ProviderName | null;
  privacyAcknowledged: boolean;
}) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [connectedAi, setConnectedAi] = useState<ProviderName | null>(aiProvider);
  // Round 14.6 privacy-before-Connect, placed at the onboarding Connect step:
  // the privacy step is the first thing the user sees here, before any connect
  // prompt. Once acknowledged (now or on a prior visit) the connectors show.
  const [acknowledged, setAcknowledged] = useState(privacyAcknowledged);

  if (!acknowledged) {
    return <ConnectPrivacyStep onAcknowledge={() => setAcknowledged(true)} onSkip={() => router.push("/dashboard")} />;
  }

  const isConnected = (id: string): boolean =>
    (id === "gmail" && gmailConnected) ||
    (id === "gcal" && calendarConnected) ||
    (id === "gdrive" && driveConnected) ||
    (id === "outlook" && outlookConnected) ||
    (id === "onedrive" && onedriveConnected);

  const viaReady = (c: Connector): boolean =>
    (c.via === "drive" && driveConnected) || (c.via === "onedrive" && onedriveConnected);

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

        {/* Featured "Connect your AI" card. Additive and skippable. */}
        <div className="mt-6 rounded-2xl border border-accent/30 bg-accent-soft/20 p-5">
          {connectedAi ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink">
                  {t("ai_card_connected", { name: AI_PROVIDER_NAME[connectedAi] ?? connectedAi })}
                </p>
                <p className="mt-0.5 text-[12.5px] text-ink-muted">{t("ai_card_connected_body")}</p>
              </div>
              <span className="rounded-md bg-sage/15 px-2 py-0.5 text-[11px] font-medium text-[#3f5240]">
                {t("link_connected")}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-ink">{t("ai_card_title")}</p>
                <p className="mt-0.5 text-[12.5px] text-ink-muted">{t("ai_card_body")}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAiModalOpen(true)}
                  className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-surface transition-base hover:bg-ink-soft"
                >
                  {t("ai_card_connect")}
                </button>
              </div>
            </div>
          )}
        </div>

        <ConnectionModal
          open={aiModalOpen}
          onClose={() => setAiModalOpen(false)}
          onConnected={(p) => setConnectedAi(p)}
        />

        <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
          {CONNECTORS.map((c) => {
            const connected = isConnected(c.id);
            // Office cards show as "available" once their parent file service is on.
            const ready = viaReady(c);
            const badge = connected ? (
              <span className="rounded-md bg-sage/15 px-2 py-0.5 text-[11px] font-medium text-[#3f5240]">
                {t("link_connected")}
              </span>
            ) : ready ? (
              <span className="rounded-md bg-sage/15 px-2 py-0.5 text-[11px] font-medium text-[#3f5240]">
                {t("link_available")}
              </span>
            ) : c.live ? (
              <span className="rounded-md bg-ink px-2 py-0.5 text-[11px] font-medium text-surface">
                {t("link_connect")}
              </span>
            ) : (
              <span className="rounded-md border border-line px-2 py-0.5 text-[11px] text-ink-faint">
                {t("link_coming_soon")}
              </span>
            );
            const desc =
              c.via && !ready
                ? c.via === "onedrive"
                  ? t("link_via_onedrive")
                  : t("link_via_drive")
                : t(`link_desc_${c.id}`);
            const body = (
              <div className="flex h-full items-start justify-between gap-3 rounded-2xl border border-line bg-surface-raised p-4">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-ink">{c.name}</p>
                  <p className="mt-0.5 text-[12px] text-ink-muted">{desc}</p>
                </div>
                <span className="shrink-0">{badge}</span>
              </div>
            );
            // Live + not yet connected -> link to its OAuth connect.
            if (c.live && !connected && c.href) {
              return (
                <a key={c.id} href={c.href} className="block">
                  {body}
                </a>
              );
            }
            // Office cards are dimmed until their parent service is connected.
            const dim = (!c.live && !c.via) || (!!c.via && !ready);
            return (
              <div key={c.id} className={dim ? "opacity-70" : ""}>
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

/**
 * The privacy step shown before the onboarding Connect prompts (Round 14.6 +
 * 14.9). Two columns, what Oria does / never does (connectPrivacy namespace,
 * from docs/trust/messaging.md). Continue records the acknowledgment
 * (acknowledgeConnectPrivacy, audited) then reveals the connectors.
 */
function ConnectPrivacyStep({
  onAcknowledge,
  onSkip,
}: {
  onAcknowledge: () => void;
  onSkip: () => void;
}) {
  const t = useTranslations("connectPrivacy");
  const [pending, startTransition] = useTransition();

  function proceed() {
    startTransition(async () => {
      await acknowledgeConnectPrivacy();
      onAcknowledge();
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex items-center justify-between px-6 py-5 sm:px-8">
        <Wordmark />
        <button
          type="button"
          onClick={onSkip}
          className="text-[13px] text-ink-muted transition-base hover:text-ink"
        >
          {t("cancel")}
        </button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-4 pb-16">
        <h1 className="text-[24px] font-semibold tracking-tight text-ink sm:text-[28px]">
          {t("header")}
        </h1>

        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface-raised p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
              {t("do_title")}
            </p>
            <ul className="mt-2.5 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <li key={i} className="flex gap-1.5 text-[13px] text-ink">
                  <span className="mt-0.5 shrink-0 text-brand" aria-hidden>
                    <CheckIcon size={14} />
                  </span>
                  <span>{t(`do_${i}`)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-surface-raised p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
              {t("never_title")}
            </p>
            <ul className="mt-2.5 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <li key={i} className="flex gap-1.5 text-[13px] text-ink-muted">
                  <span className="mt-0.5 shrink-0 text-ink-faint" aria-hidden>
                    <CloseIcon size={14} />
                  </span>
                  <span>{t(`never_${i}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-4 text-[11.5px] leading-snug text-ink-faint">{t("footer")}</p>

        <button
          type="button"
          onClick={proceed}
          disabled={pending}
          className="mt-7 w-full rounded-xl bg-ink px-5 py-3 text-[15px] font-medium text-surface transition-base hover:bg-ink-soft disabled:opacity-50"
        >
          {t("continue")}
        </button>
      </main>
    </div>
  );
}
