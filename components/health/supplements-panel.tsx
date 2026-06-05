import { getTranslations } from "next-intl/server";
import { TextLogForm } from "@/components/section/text-log-form";

/** Supplements: a calm log-by-text (and voice, via the shared mic) surface.
 *  Entries file into the Health section so they show alongside the rest of the
 *  record. The dedicated supplement schedule + reminders are a later pass. */
export async function SupplementsPanel() {
  const t = await getTranslations("health");
  return (
    <div className="space-y-5">
      <p className="px-1 text-[13px] text-ink-muted">{t("supplements_empty")}</p>
      <TextLogForm
        section="health"
        placeholder={t("supplement_placeholder")}
        label={t("log_supplement")}
      />
    </div>
  );
}
