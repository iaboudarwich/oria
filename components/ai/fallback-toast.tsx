"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { dismissAiNotice } from "@/lib/data/ai-connection-actions";

const PROVIDER_NAME: Record<string, string> = {
  anthropic: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
};

/**
 * One-time, non-blocking toast shown when a user's connected AI silently fell
 * back to Oria's default at query time. Dismissing clears the server-side
 * notice so it never repeats.
 */
export function AiFallbackToast({
  notice,
}: {
  notice: { provider: string; status: string } | null;
}) {
  const t = useTranslations("ai");
  const [shown, setShown] = useState(true);
  if (!notice || !shown) return null;

  const name = PROVIDER_NAME[notice.provider] ?? notice.provider;
  const message =
    notice.status === "rate_limited"
      ? t("fallback_rate_limited", { name })
      : notice.status === "out_of_credits"
        ? t("fallback_out_of_credits", { name })
        : t("fallback_invalid", { name });

  function dismiss() {
    setShown(false);
    void dismissAiNotice();
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2 rounded-xl border border-line bg-surface-raised px-4 py-3 shadow-lg">
      <p className="text-[13px] text-ink">{message}</p>
      <div className="mt-2 flex items-center gap-3">
        <Link
          href="/dashboard/settings/ai"
          onClick={dismiss}
          className="text-[12.5px] font-medium text-accent hover:underline"
        >
          {t("fallback_cta")}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="text-[12.5px] text-ink-faint hover:text-ink"
        >
          {t("fallback_dismiss")}
        </button>
      </div>
    </div>
  );
}
