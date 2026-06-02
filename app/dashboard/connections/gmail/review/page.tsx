import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/dashboard/topbar";
import { getCurrentContext } from "@/lib/data/organizations";
import { getGmailConnection, getGmailItemCounts } from "@/lib/integrations/gmail/connections";
import { getLatestScanJob, listDetectedItems } from "@/lib/integrations/gmail/scan";
import { ScanProgress } from "@/components/connections/scan-progress";
import { GmailReviewList } from "@/components/connections/gmail-review-list";
import { ScanEmptyState } from "@/components/connections/scan-empty-state";

export const metadata = { title: "Email items" };
export const dynamic = "force-dynamic";

export default async function GmailReviewPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");

  const connection = await getGmailConnection(ctx.profile.id);
  if (!connection) redirect("/dashboard/settings?tab=connections");

  const [job, items, counts] = await Promise.all([
    getLatestScanJob(ctx.profile.id),
    listDetectedItems(ctx.profile.id, "pending"),
    getGmailItemCounts(ctx.profile.id),
  ]);
  const t = await getTranslations("gmailReview");

  return (
    <>
      <Topbar title={t("title")} />

      <div className="mx-auto max-w-2xl space-y-6 animate-fade-up">
        <p className="text-[13px] text-ink-muted">
          {t("header_sub", { pending: counts.pending, approved: counts.approved })}
        </p>

        <ScanProgress
          initialJob={job}
          hasItems={items.length > 0}
        />

        {items.length > 0 ? (
          <GmailReviewList items={items} />
        ) : (
          <ScanEmptyState
            job={
              job
                ? { status: job.status, emailsTotal: job.emailsTotal, itemsFound: job.itemsFound }
                : null
            }
          />
        )}
      </div>
    </>
  );
}
