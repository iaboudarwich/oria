import { getTranslations } from "next-intl/server";
import { DropzoneCompact } from "@/components/upload/dropzone-compact";
import { TextLogForm } from "@/components/section/text-log-form";
import { HealthTimelineView } from "@/components/sections/health-timeline-view";

/** Vitals: the medical record. Appointments, prescriptions, and lab results
 *  Oria has filed into the Health section, plus the drop / type affordances to
 *  add more. Reuses the existing HealthTimelineView so nothing is duplicated. */
export async function VitalsPanel({
  orgId,
  filter,
}: {
  orgId: string;
  filter?: string;
}) {
  const t = await getTranslations("health");
  return (
    <div className="space-y-5">
      <p className="px-1 text-[13px] text-ink-muted">{t("vitals_intro")}</p>
      <DropzoneCompact
        defaultSection="health"
        heading="Drop a result or document"
        subheading="or click to add"
      />
      <TextLogForm
        section="health"
        placeholder="e.g. ‘Dr Patel follow-up June 12 at 10am’"
        label="Or log by text"
      />
      <HealthTimelineView orgId={orgId} filter={filter} />
    </div>
  );
}
