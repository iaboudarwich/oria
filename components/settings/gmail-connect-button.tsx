"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * Starts the Gmail OAuth flow behind a privacy-forward consent modal. Used both
 * for the first connection and for "Connect another Gmail" (the OAuth start
 * route sends prompt=select_account so the user can pick a different account).
 */
export function GmailConnectButton({
  configured,
  variant = "primary",
  label,
}: {
  configured: boolean;
  variant?: "primary" | "secondary";
  label: string;
}) {
  const t = useTranslations("connections");
  const [open, setOpen] = useState(false);
  const [seedConfidential, setSeedConfidential] = useState(true);

  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)} disabled={!configured}>
        {label}
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gmail-consent-title"
          className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6"
        >
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="animate-fade-in absolute inset-0 bg-ink/40 backdrop-blur-sm"
          />
          <div className="animate-scale-in relative z-[121] w-full max-w-md rounded-2xl border border-line bg-surface-raised p-6 shadow-xl">
            <h2 id="gmail-consent-title" className="text-title text-ink">
              {t("consent_title")}
            </h2>
            <p className="text-body mt-3 text-ink-soft">{t("consent_body")}</p>
            <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg bg-surface px-3 py-2.5">
              <input
                type="checkbox"
                checked={seedConfidential}
                onChange={(e) => setSeedConfidential(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-ink"
              />
              <span className="text-[12.5px] text-ink-soft">{t("consent_confidential")}</span>
            </label>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="transition-base text-[12.5px] text-ink-faint hover:text-ink"
              >
                {t("consent_cancel")}
              </button>
              {/* Plain anchor (no Link prefetch) so the OAuth start route is
                  only hit on an actual click, never on prefetch. */}
              <a
                href={
                  seedConfidential
                    ? "/api/oauth/gmail/start"
                    : "/api/oauth/gmail/start?confidential=0"
                }
                className="transition-base inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-ink px-4 text-[13.5px] font-medium text-surface hover:bg-ink-soft"
              >
                {t("consent_continue")}
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
