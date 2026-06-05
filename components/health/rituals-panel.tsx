import { getTranslations } from "next-intl/server";

/**
 * Rituals: daily habits with streaks (and a streak freeze) are a focused
 * feature shipping in a 17.x follow-up. The tab exists now so the surface is
 * complete; it shows a plain calm state rather than a broken panel.
 */
export async function RitualsPanel() {
  const t = await getTranslations("health");
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface-raised py-14 text-center">
      <h2 className="text-title text-ink">{t("rituals_soon")}</h2>
      <p className="mt-2 max-w-sm text-body text-ink-muted">{t("rituals_body")}</p>
    </div>
  );
}
