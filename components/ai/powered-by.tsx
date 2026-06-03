"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

const PROVIDER_NAME: Record<string, string> = {
  anthropic: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
};

/**
 * Subtle "Powered by ..." line under the Ask Oria input. Shows the user's
 * connected provider when active, else Oria's default. Links to Settings -> AI.
 */
export function PoweredBy({
  provider,
  reasoning = false,
}: {
  provider: string | null;
  reasoning?: boolean;
}) {
  const t = useTranslations("ai");
  const base = provider
    ? t("powered_by_user", { name: PROVIDER_NAME[provider] ?? provider })
    : t("powered_by_default");
  const label = reasoning ? `${base} ${t("powered_reasoning_suffix")}` : base;
  return (
    <Link
      href="/dashboard/settings/ai"
      className="mt-2 block text-center text-[11px] text-ink-faint transition-base hover:text-ink-muted"
    >
      {label}
    </Link>
  );
}
