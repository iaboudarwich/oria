"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import * as Sentry from "@sentry/nextjs";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { AlertIcon, RotateIcon, BugIcon } from "@/components/ui/icon";
import { ReportDialog } from "@/components/feedback/report-dialog";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface-raised p-8 text-center shadow-sm">
        <div className="flex justify-center">
          <Wordmark href="/" />
        </div>
        <div className="mt-6 flex justify-center text-ink-faint">
          <AlertIcon size={26} />
        </div>
        <p className="text-body mt-4 text-ink-soft">{t("boundary_title")}</p>
        <div className="mt-6 flex flex-col gap-2">
          <Button variant="primary" onClick={() => reset()}>
            <RotateIcon size={14} />
            {t("tryAgain")}
          </Button>
          <Button variant="secondary" onClick={() => setReportOpen(true)}>
            <BugIcon size={14} />
            {t("report")}
          </Button>
        </div>
      </div>
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} />
    </main>
  );
}
