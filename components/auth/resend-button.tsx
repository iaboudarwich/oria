"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { resendSignupEmail } from "@/lib/auth/actions";

/**
 * "Resend email" button for the verification screen. Enforces a 60-second
 * cooldown after each send so a user cannot spam the mailer.
 */
export function ResendButton({ email }: { email: string }) {
  const t = useTranslations("auth");
  const [cooldown, setCooldown] = useState(0);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(
      () => setCooldown((c) => Math.max(0, c - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [cooldown]);

  function resend() {
    if (cooldown > 0 || pending) return;
    startTransition(async () => {
      await resendSignupEmail(email);
      setSent(true);
      setCooldown(60);
    });
  }

  const disabled = cooldown > 0 || pending;

  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={resend}
        disabled={disabled}
        className="inline-flex h-10 items-center justify-center rounded-xl border border-line-strong bg-surface-raised px-4 text-[13.5px] font-medium text-ink transition-base hover:border-ink-muted disabled:opacity-50"
      >
        {cooldown > 0 ? t("verify_cooldown", { seconds: cooldown }) : t("verify_resend")}
      </button>
      {sent && cooldown > 0 ? (
        <p className="text-[12px] text-ink-faint">{t("verify_resent")}</p>
      ) : null}
    </div>
  );
}
