import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/dashboard/topbar";
import { getCurrentContext } from "@/lib/data/organizations";
import { getGmailConnection } from "@/lib/integrations/gmail/connections";
import { getLatestScanJob, listDetectedItems } from "@/lib/integrations/gmail/scan";
import { ScanProgress } from "@/components/connections/scan-progress";

export const metadata = { title: "Email items" };
export const dynamic = "force-dynamic";

const TYPE_KEYS: Record<string, string> = {
  subscription: "type_subscription",
  bill: "type_bill",
  flight: "type_flight",
  booking: "type_booking",
  receipt: "type_receipt",
  other: "type_other",
};

export default async function GmailReviewPage() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");

  const connection = await getGmailConnection(ctx.profile.id);
  if (!connection) redirect("/dashboard/settings?tab=connections");

  const [job, items] = await Promise.all([
    getLatestScanJob(ctx.profile.id),
    listDetectedItems(ctx.profile.id, "pending"),
  ]);
  const t = await getTranslations("gmailReview");

  return (
    <>
      <Topbar title={t("title")} />

      <div className="mx-auto max-w-2xl space-y-6 animate-fade-up">
        <p className="text-[13px] text-ink-muted">{t("subtitle")}</p>

        <ScanProgress
          initialJob={job}
          hasItems={items.length > 0}
        />

        {items.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface-raised px-5 py-10 text-center">
            <p className="text-[14px] font-medium text-ink">{t("empty_title")}</p>
            <p className="mt-1 text-[13px] text-ink-muted">{t("empty_body")}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const pct = item.confidence != null ? Math.round(item.confidence * 100) : null;
              return (
                <li
                  key={item.id}
                  className="rounded-xl border border-line bg-surface-raised px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                          {t(TYPE_KEYS[item.itemType] ?? "type_other")}
                        </span>
                        <p className="truncate text-[14px] font-medium text-ink">
                          {item.extracted.title || item.sourceSubject || t("type_other")}
                        </p>
                      </div>
                      {item.extracted.summary ? (
                        <p className="mt-1 text-[12.5px] text-ink-muted">{item.extracted.summary}</p>
                      ) : null}
                      {item.sourceFrom ? (
                        <p className="mt-1 truncate text-[11.5px] text-ink-faint">
                          {t("from", { sender: item.sourceFrom })}
                        </p>
                      ) : null}
                    </div>
                    {pct != null ? (
                      <span className="shrink-0 text-[11px] text-ink-faint">
                        {t("confidence", { percent: pct })}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
