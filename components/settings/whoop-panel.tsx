import { getTranslations } from "next-intl/server";
import { listWhoopConnections } from "@/lib/whoop/connections";
import { relativeTime } from "@/lib/utils";
import { WhoopDisconnectButton } from "./whoop-disconnect-button";

const DOT: Record<string, string> = {
  active: "bg-sage",
  paused: "bg-ink-faint",
  error: "bg-claret",
  revoked: "bg-claret",
};

/**
 * Settings -> Connections, Zone 1: the WHOOP card. Self-hides when WHOOP is
 * not connected (the Available zone owns the Connect action). Shows status, a
 * plain "last updated" line, and disconnect.
 */
export async function WhoopPanel({ userId }: { userId: string }) {
  const conns = await listWhoopConnections(userId);
  if (conns.length === 0) return null;
  const conn = conns[0];
  const t = await getTranslations("health");

  const updated = conn.lastSyncedAt
    ? t("whoop_updated", { time: relativeTime(conn.lastSyncedAt) })
    : t("whoop_waiting");

  return (
    <section className="space-y-2 rounded-2xl border border-line bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${DOT[conn.status] ?? "bg-ink-faint"}`} />
          <span className="text-[13.5px] font-semibold text-ink">{t("whoop_connected")}</span>
        </div>
        <WhoopDisconnectButton
          label={t("disconnect")}
          confirmLabel={t("disconnect_confirm")}
          pendingLabel={t("disconnecting")}
        />
      </div>
      <p className="text-[12px] text-ink-muted">
        {conn.status === "error" && conn.lastError ? conn.lastError : updated}
      </p>
    </section>
  );
}
