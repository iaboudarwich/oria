import { getTranslations } from "next-intl/server";
import { HeartIcon } from "@/components/ui/icon";
import { ConnectButton } from "@/components/settings/connect-privacy-gate";

/**
 * The calm state shown on a WHOOP-fed tab (Body / Movement / Sleep) with no
 * data yet. If WHOOP is connected, it is simply waiting for the first update;
 * otherwise it offers Connect, routed through the privacy gate (principle 15):
 * the what-we-do / what-we-never-do step appears before the first connect.
 */
export async function WhoopCta({
  body,
  acknowledged,
  whoopConnected,
}: {
  body: string;
  acknowledged: boolean;
  whoopConnected: boolean;
}) {
  const t = await getTranslations("health");
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface-raised py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sand/60 text-ink-muted">
        <HeartIcon size={22} />
      </div>
      <h2 className="text-title text-ink">
        {whoopConnected ? t("whoop_waiting") : t("connect_whoop")}
      </h2>
      <p className="mt-2 max-w-sm text-body text-ink-muted">{body}</p>
      {whoopConnected ? null : (
        <div className="mt-5">
          <ConnectButton
            href="/api/oauth/whoop/start"
            acknowledged={acknowledged}
            label={t("connect_whoop")}
          />
        </div>
      )}
    </div>
  );
}
