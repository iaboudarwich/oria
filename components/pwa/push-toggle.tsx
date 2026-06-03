"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BellIcon } from "@/components/ui/icon";
import {
  isPushSupported,
  hasPublicKey,
  getExistingSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  notificationPermission,
} from "@/lib/pwa/push-client";
import { isIos, isStandalone } from "@/lib/pwa/standalone";

type Status =
  | "loading"
  | "unsupported"
  | "ios_install"
  | "unavailable"
  | "blocked"
  | "ready";

/**
 * Settings toggle for Web Push. Permission is requested only when the user
 * flips the toggle (never on load). The test-notification button is shown only
 * in development or to admins; the route enforces the same gate server-side.
 */
export function PushToggle({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations("pwa");
  const [status, setStatus] = useState<Status>("loading");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.resolve(); // avoid setting state synchronously in-effect
      if (!active) return;
      if (!isPushSupported()) {
        // On iPhone/iPad, Web Push only works once Oria is installed to the
        // Home Screen (iOS 16.4+). In a browser tab the real fix is "install
        // first", not "your browser can't do this". Reserve the genuine
        // unsupported message for browsers that truly cannot.
        if (isIos() && !isStandalone()) return setStatus("ios_install");
        return setStatus("unsupported");
      }
      if (!hasPublicKey()) return setStatus("unavailable");
      if (notificationPermission() === "denied") return setStatus("blocked");
      const sub = await getExistingSubscription();
      if (!active) return;
      setSubscribed(!!sub);
      setStatus("ready");
    })();
    return () => {
      active = false;
    };
  }, []);

  async function onToggle() {
    setBusy(true);
    setNote(null);
    if (subscribed) {
      await unsubscribeFromPush();
      setSubscribed(false);
    } else {
      const res = await subscribeToPush();
      if (res.ok) {
        setSubscribed(true);
      } else if (res.reason === "denied") {
        setStatus("blocked");
      } else if (res.reason === "unavailable") {
        setStatus("unavailable");
      } else {
        setNote(t("push_error"));
      }
    }
    setBusy(false);
  }

  async function onTest() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      setNote(res.ok ? t("push_test_sent") : t("push_error"));
    } catch {
      setNote(t("push_error"));
    }
    setBusy(false);
  }

  const showTest =
    subscribed && (process.env.NODE_ENV !== "production" || isAdmin);

  return (
    <section>
      <h2 className="mb-3 px-1 text-eyebrow">{t("push_title")}</h2>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised px-4 py-4 shadow-[0_1px_2px_rgba(28,26,23,0.04)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-ink-muted">
              <BellIcon size={18} />
            </span>
            <div>
              <p className="text-[13px] text-ink">{t("push_body")}</p>
              {status === "unsupported" && (
                <p className="mt-0.5 text-[11.5px] text-ink-faint">{t("push_unsupported")}</p>
              )}
              {status === "ios_install" && (
                <p className="mt-0.5 text-[11.5px] text-ink-faint">{t("push_ios_install")}</p>
              )}
              {status === "unavailable" && (
                <p className="mt-0.5 text-[11.5px] text-ink-faint">{t("push_unavailable")}</p>
              )}
              {status === "blocked" && (
                <p className="mt-0.5 text-[11.5px] text-ink-faint">{t("push_blocked")}</p>
              )}
              {note && <p className="mt-0.5 text-[11.5px] text-ink-faint">{note}</p>}
            </div>
          </div>

          {status === "ready" && (
            <button
              type="button"
              onClick={onToggle}
              disabled={busy}
              className="inline-flex h-9 shrink-0 items-center rounded-lg bg-ink px-3 text-[12.5px] font-medium text-surface transition-base hover:bg-ink-soft disabled:opacity-50"
            >
              {subscribed ? t("push_disable") : t("push_enable")}
            </button>
          )}
        </div>

        {showTest && (
          <div className="mt-3 border-t border-line pt-3">
            <button
              type="button"
              onClick={onTest}
              disabled={busy}
              className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12px] text-ink-muted transition-base hover:text-ink disabled:opacity-50"
            >
              {t("push_test")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
