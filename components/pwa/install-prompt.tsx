"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { isIos, isStandalone } from "@/lib/pwa/standalone";
import { CloseIcon } from "@/components/ui/icon";
import { versionedIcon } from "@/lib/brand/icon-version";

/**
 * Install affordance.
 *
 *  - Chromium: captures `beforeinstallprompt`, suppresses the mini-infobar, and
 *    shows a subtle card; the action triggers the native prompt.
 *  - iOS Safari (no beforeinstallprompt): shows the same card, whose action
 *    opens an "Add to Home Screen" instructions sheet.
 *
 * Never shown when already installed (standalone). Dismissal is persisted in
 * localStorage so it does not nag. Copy is localized via the `pwa` namespace.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "oria-install-dismissed";

export function InstallPrompt() {
  const t = useTranslations("pwa");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      // localStorage unavailable (private mode): just proceed without persistence.
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => persistDismiss();

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS has no beforeinstallprompt; offer the manual path instead. Defer the
    // state update to the next frame so it is not set synchronously in-effect.
    let raf = 0;
    if (isIos()) {
      raf = requestAnimationFrame(() => {
        setIos(true);
        setVisible(true);
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  function persistDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setVisible(false);
    setSheet(false);
  }

  async function handleAction() {
    if (ios) {
      setSheet(true);
      return;
    }
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    persistDismiss();
  }

  if (!visible) return null;

  return (
    <>
      <div
        role="complementary"
        aria-label={t("install_title")}
        className="animate-fade-up fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2"
      >
        <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-floating p-3 shadow-raised">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={versionedIcon("/icons/icon-192.png")}
            alt=""
            width={40}
            height={40}
            className="mt-0.5 h-10 w-10 shrink-0 rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-ink">
              {ios ? t("install_title_ios") : t("install_title")}
            </p>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              {ios ? t("install_body_ios") : t("install_body")}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleAction}
                className="transition-base inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[12.5px] font-medium text-surface hover:bg-ink-soft"
              >
                {ios ? t("ios_show_how") : t("install_action")}
              </button>
              <button
                type="button"
                onClick={persistDismiss}
                className="transition-base inline-flex h-8 items-center rounded-lg px-2.5 text-[12.5px] text-ink-muted hover:text-ink"
              >
                {t("install_dismiss")}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={persistDismiss}
            aria-label={t("install_dismiss")}
            className="transition-base shrink-0 rounded-md p-1 text-ink-faint hover:text-ink"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      </div>

      {sheet ? (
        <div
          className="animate-fade-in fixed inset-0 z-[60] flex items-end justify-center bg-ink/30 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={t("ios_title")}
          onClick={persistDismiss}
        >
          <div
            className="animate-fade-up w-full max-w-sm rounded-2xl border border-line bg-surface-floating p-5 shadow-raised"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[16px] font-semibold text-ink">{t("ios_title")}</h2>
            <p className="mt-1 text-[13px] text-ink-muted">{t("ios_intro")}</p>
            <ol className="mt-3 space-y-2 text-[13px] text-ink">
              <li className="flex gap-2">
                <span className="text-ink-faint">1.</span>
                <span>{t("ios_step_share")}</span>
              </li>
              <li className="flex gap-2">
                <span className="text-ink-faint">2.</span>
                <span>{t("ios_step_add")}</span>
              </li>
            </ol>
            <button
              type="button"
              onClick={persistDismiss}
              className="transition-base mt-4 inline-flex h-9 w-full items-center justify-center rounded-lg bg-ink px-3 text-[13px] font-medium text-surface hover:bg-ink-soft"
            >
              {t("ios_done")}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
