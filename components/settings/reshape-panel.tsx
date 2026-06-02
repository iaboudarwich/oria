import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getCurrentContext } from "@/lib/data/organizations";
import { listRecentSetupChanges } from "@/lib/onboarding/setup-changes";
import { RecentSetupChanges } from "./recent-setup-changes";

/**
 * Settings -> Preferences: start a reshape conversation, and review/undo recent
 * setup changes (24h window).
 */
export async function ReshapePanel() {
  const ctx = await getCurrentContext();
  if (!ctx) return null;
  const changes = await listRecentSetupChanges(ctx.profile.id);
  const t = await getTranslations("reshape");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{t("settings_title")}</h2>
        <p className="mt-1 text-[13px] text-ink-muted">{t("settings_subtitle")}</p>
      </div>
      <Link
        href="/dashboard/reshape"
        className="inline-flex h-9 items-center rounded-lg bg-ink px-4 text-[12.5px] font-medium text-surface transition-base hover:bg-ink-soft"
      >
        {t("settings_button")}
      </Link>
      <div>
        <p className="mb-2 text-[12.5px] font-medium text-ink">{t("changes_title")}</p>
        <RecentSetupChanges changes={changes} />
      </div>
    </section>
  );
}
