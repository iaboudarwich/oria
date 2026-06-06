"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { acknowledgeConnectPrivacy } from "@/lib/data/connect-privacy-actions";
import { useFocusNext } from "@/lib/hooks/use-focus-next";
import { CheckIcon, CloseIcon } from "@/components/ui/icon";

/**
 * Round 14.6 F2: the privacy step before Connect. The first time a user
 * connects ANY data source, this intercepts the Connect link and shows what
 * Oria does and never does with their data (from docs/trust/messaging.md).
 * On acknowledge it records the consent, then proceeds to the OAuth flow. Once
 * acknowledged it gets out of the way: Connect navigates straight through.
 */
export function ConnectButton({
  href,
  acknowledged,
  label,
  confirm,
}: {
  href: string;
  acknowledged: boolean;
  label: string;
  /** Scope confirm shown before linking, naming the target scope (Round 16.8). */
  confirm?: { title: string; body: string; continueLabel: string; cancelLabel: string };
}) {
  const t = useTranslations("connectPrivacy");
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Focus the primary "Continue" as each step appears, so it is never offscreen.
  const confirmContinueRef = useFocusNext<HTMLButtonElement>(confirmOpen, { enabled: confirmOpen });
  const privacyContinueRef = useFocusNext<HTMLButtonElement>(open, { enabled: open });

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (!acknowledged) {
      setOpen(true); // first-time: privacy step, then the scope confirm
      return;
    }
    if (confirm) {
      setConfirmOpen(true);
      return;
    }
    window.location.href = href;
  }

  // After the privacy step: record consent, then name the scope (if any).
  function proceed() {
    startTransition(async () => {
      await acknowledgeConnectPrivacy();
      if (confirm) {
        setOpen(false);
        setConfirmOpen(true);
      } else {
        window.location.href = href;
      }
    });
  }

  function go() {
    window.location.href = href;
  }

  return (
    <>
      <a
        href={href}
        onClick={onClick}
        className="transition-base inline-flex h-9 items-center rounded-[10px] bg-ink px-3 text-[12.5px] font-medium text-surface hover:bg-ink-soft"
      >
        {label}
      </a>

      {confirmOpen && confirm ? (
        <div
          className="animate-fade-in fixed inset-0 z-[60] flex items-end justify-center bg-ink/30 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={confirm.title}
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="animate-fade-up w-full max-w-sm rounded-2xl border border-line bg-surface-floating p-5 shadow-raised"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[15px] font-semibold text-ink">{confirm.title}</h2>
            <p className="mt-2 text-[13px] text-ink-muted">{confirm.body}</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="transition-base inline-flex h-9 items-center rounded-lg px-3 text-[12.5px] text-ink-muted hover:text-ink"
              >
                {confirm.cancelLabel}
              </button>
              <button
                ref={confirmContinueRef}
                type="button"
                onClick={go}
                className="transition-base inline-flex h-9 items-center rounded-lg bg-ink px-3 text-[12.5px] font-medium text-surface hover:bg-ink-soft"
              >
                {confirm.continueLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {open ? (
        <div
          className="animate-fade-in fixed inset-0 z-[60] flex items-end justify-center bg-ink/30 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={t("header")}
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="animate-fade-up w-full max-w-md rounded-2xl border border-line bg-surface-floating p-5 shadow-raised"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-ink">{t("header")}</h2>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                aria-label={t("cancel")}
                className="transition-base shrink-0 text-ink-faint hover:text-ink"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">
                  {t("do_title")}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <li key={i} className="flex gap-1.5 text-[12.5px] text-ink">
                      <span className="mt-0.5 shrink-0 text-brand" aria-hidden>
                        <CheckIcon size={13} />
                      </span>
                      <span>{t(`do_${i}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">
                  {t("never_title")}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <li key={i} className="flex gap-1.5 text-[12.5px] text-ink-muted">
                      <span className="mt-0.5 shrink-0 text-ink-faint" aria-hidden>
                        <CloseIcon size={13} />
                      </span>
                      <span>{t(`never_${i}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="mt-4 text-[11.5px] leading-snug text-ink-faint">{t("footer")}</p>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="transition-base inline-flex h-9 items-center rounded-lg px-3 text-[12.5px] text-ink-muted hover:text-ink disabled:opacity-50"
              >
                {t("cancel")}
              </button>
              <button
                ref={privacyContinueRef}
                type="button"
                onClick={proceed}
                disabled={pending}
                className="transition-base inline-flex h-9 items-center rounded-lg bg-ink px-3 text-[12.5px] font-medium text-surface hover:bg-ink-soft disabled:opacity-50"
              >
                {t("continue")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
