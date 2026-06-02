import { getTranslations } from "next-intl/server";
import { getGmailConnection } from "@/lib/integrations/gmail/connections";
import { isGmailOAuthConfigured } from "@/lib/integrations/gmail/oauth";
import { isTokenCryptoConfigured } from "@/lib/security/token-crypto";
import { GmailCard } from "./gmail-card";

/**
 * Settings -> Connections. Currently one provider (Gmail). Server-rendered;
 * the card handles the consent modal and disconnect on the client.
 */
export async function ConnectionsPanel({ userId }: { userId: string }) {
  const summary = await getGmailConnection(userId);
  const configured = isGmailOAuthConfigured() && isTokenCryptoConfigured();
  const t = await getTranslations("connections");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{t("title")}</h2>
        <p className="mt-1 text-[13px] text-ink-muted">{t("subtitle")}</p>
      </div>
      <GmailCard
        configured={configured}
        summary={
          summary
            ? {
                email: summary.email,
                status: summary.status,
                lastSyncedAt: summary.lastSyncedAt,
                connectedAt: summary.connectedAt,
              }
            : null
        }
      />
    </section>
  );
}
