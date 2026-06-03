import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/wordmark";
import { OfflineRetry } from "@/components/pwa/offline-retry";

/**
 * Offline shell. Precached by the service worker (public/sw.js) and served as
 * the fallback when a navigation fails with no network. It is deliberately a
 * static, branded, localized page with NO user data: the SW never caches
 * authenticated HTML, so this is what an offline user sees instead of stale
 * private content.
 *
 * Note: the SW precaches this at install time in whatever locale was active
 * then; a later locale switch updates it on the next successful online visit.
 */
export const metadata = { title: "Offline" };

export default async function OfflinePage() {
  const t = await getTranslations("pwa");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <Wordmark href={undefined} />
      <div className="max-w-sm space-y-2">
        <h1 className="text-[20px] font-semibold text-ink">{t("offline_title")}</h1>
        <p className="text-[14px] text-ink-muted">{t("offline_body")}</p>
      </div>
      <OfflineRetry label={t("offline_retry")} />
    </main>
  );
}
