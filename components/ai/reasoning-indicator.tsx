"use client";

import { useTranslations } from "next-intl";
import { SparkIcon } from "@/components/ui/icon";

/**
 * Small, reusable "Thinking deeper..." indicator. Used in the onboarding
 * tailoring loading state and Ask Oria's reasoning state, so the visual
 * language for reasoning is consistent. Pass `label` to override the default.
 */
export function ReasoningIndicator({ label }: { label?: string }) {
  const t = useTranslations("ai");
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-soft">
      <SparkIcon size={13} />
      <span className="text-[13.5px]">{label ?? t("indicator")}</span>
    </span>
  );
}
