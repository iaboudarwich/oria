"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BugIcon } from "@/components/ui/icon";
import { ReportDialog } from "@/components/feedback/report-dialog";

/**
 * The persistent "Report a problem" entry near the bottom of the dashboard
 * sidebar. Small and quiet by design. Opens the shared report dialog.
 */
export function ReportProblemButton({
  userId,
  collapsed,
}: {
  userId?: string;
  collapsed?: boolean;
}) {
  const t = useTranslations("feedback");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("trigger")}
        title={t("trigger")}
        className={`mt-1 flex items-center gap-2 rounded-lg text-ink-faint transition-base hover:bg-ink/[0.04] hover:text-ink-muted ${
          collapsed ? "justify-center px-2 py-2" : "px-3 py-1.5"
        }`}
      >
        <BugIcon size={15} />
        {collapsed ? null : (
          <span className="text-body-sm">{t("trigger")}</span>
        )}
      </button>
      <ReportDialog open={open} onClose={() => setOpen(false)} userId={userId} />
    </>
  );
}
