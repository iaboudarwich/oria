import { getTranslations } from "next-intl/server";
import { getCurrentContext } from "@/lib/data/organizations";
import { listRecentSetupChanges } from "@/lib/onboarding/setup-changes";
import { RecentSetupChanges } from "./recent-setup-changes";

/**
 * Settings -> Preferences: review and undo recent setup changes (24h window).
 * Starting a reshape now lives in exactly two places (the workspace menu and
 * Ask Oria), so this panel is management-only, not an entry point (F5).
 */
export async function ReshapePanel() {
  const ctx = await getCurrentContext();
  if (!ctx) return null;
  const changes = await listRecentSetupChanges(ctx.profile.id);
  const t = await getTranslations("reshape");

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{t("changes_title")}</h2>
        <p className="mt-1 text-[13px] text-ink-muted">{t("settings_subtitle")}</p>
      </div>
      <RecentSetupChanges changes={changes} />
    </section>
  );
}
