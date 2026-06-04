"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "@/lib/auth/actions";

/**
 * Request-a-reset-link form. On submit it immediately enters a disabled,
 * spinning pending state (not re-clickable), then shows a neutral confirmation
 * that never reveals whether the address has an account. A hit rate limit shows
 * friendly copy, not a raw error.
 */
export function ForgotClient({ defaultEmail }: { defaultEmail?: string }) {
  const t = useTranslations("auth");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "ratelimited">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    try {
      const res = await requestPasswordReset(email);
      setStatus(res.rateLimited ? "ratelimited" : "sent");
    } catch {
      // Even on an unexpected failure we stay neutral.
      setStatus("sent");
    }
  }

  if (status === "sent") {
    return (
      <div className="mt-6 space-y-4 text-center">
        <p
          role="status"
          className="rounded-xl border border-line bg-canvas px-3.5 py-3 text-body-sm text-ink-soft"
        >
          {t("forgot_sent_neutral")}
        </p>
        <Link href="/login" className="block text-body-sm text-brand hover:opacity-80">
          {t("forgot_back")}
        </Link>
      </div>
    );
  }

  const sending = status === "sending";
  return (
    <form className="mt-6 space-y-3" onSubmit={onSubmit} noValidate>
      <label className="block">
        <span className="mb-1.5 block text-[12px] text-ink-muted">{t("email_label")}</span>
        <input
          type="email"
          name="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 text-[16px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-ink"
        />
      </label>

      {status === "ratelimited" ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-xl border border-warning/30 bg-warning-soft/40 px-3.5 py-2.5 text-[12.5px] text-ink-soft"
        >
          {t("forgot_rate_limited")}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        disabled={sending}
        aria-busy={sending}
      >
        {sending ? (
          <>
            <span
              className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
              aria-hidden
            />
            {t("forgot_sending")}
          </>
        ) : (
          t("forgot_submit")
        )}
      </Button>

      <div className="pt-2 text-center">
        <Link href="/login" className="text-[12.5px] text-ink-faint hover:text-ink">
          {t("forgot_back")}
        </Link>
      </div>
    </form>
  );
}
