import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/dashboard/topbar";
import { getCurrentContext } from "@/lib/data/organizations";
import { listGmailConnections, getGmailItemCounts } from "@/lib/integrations/gmail/connections";
import { getAggregateScanStatus, listDetectedItems } from "@/lib/integrations/gmail/scan";
import { ScanProgress } from "@/components/connections/scan-progress";
import { GmailReviewList } from "@/components/connections/gmail-review-list";
import { ScanEmptyState } from "@/components/connections/scan-empty-state";

export const metadata = { title: "Email items" };
export const dynamic = "force-dynamic";

export default async function GmailReviewPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");

  const connections = await listGmailConnections(ctx.profile.id);
  if (connections.length === 0) redirect("/dashboard/settings?tab=connections");

  const [status, items, counts] = await Promise.all([
    getAggregateScanStatus(ctx.profile.id),
    listDetectedItems(ctx.profile.id, "pending"),
    getGmailItemCounts(ctx.profile.id),
  ]);
  const t = await getTranslations("gmailReview");

  // Source filter chips: only emails that actually have pending items.
  const sources = connections
    .map((c) => c.email)
    .filter((email) => items.some((i) => i.sourceEmail === email));

  return (
    <>
      <Topbar title={t("title")} />

      <div className="mx-auto max-w-2xl space-y-6 animate-fade-up">
        <p className="text-[13px] text-ink-muted">
          {t("header_sub", { pending: counts.pending, approved: counts.approved })}
        </p>

        <ScanProgress initialStatus={status} hasItems={items.length > 0} />

        {items.length > 0 ? (
          <GmailReviewList items={items} sources={sources} />
        ) : (
          <ScanEmptyState
            status={{
              status: status.status,
              emailsTotal: status.emailsTotal,
              itemsFound: status.itemsFound,
            }}
          />
        )}
      </div>
    </>
  );
}
