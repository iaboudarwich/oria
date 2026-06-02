import { getTranslations } from "next-intl/server";
import { getCurrentContext } from "@/lib/data/organizations";
import { listLearnedRules } from "@/lib/data/learned-routing";
import { LearnedRulesList } from "./learned-rules-list";

/**
 * Settings -> Preferences: the rules Oria has learned from the user's filing
 * corrections, each removable. Transparency + control over the brain.
 */
export async function LearnedRulesPanel() {
  const ctx = await getCurrentContext();
  if (!ctx) return null;
  const rules = await listLearnedRules(ctx.profile.id, ctx.organization.id);
  const t = await getTranslations("learnRule");

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{t("rules_title")}</h2>
        <p className="mt-1 text-[13px] text-ink-muted">{t("rules_subtitle")}</p>
      </div>
      <LearnedRulesList rules={rules} />
    </section>
  );
}
