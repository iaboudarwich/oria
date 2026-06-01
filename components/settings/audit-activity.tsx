import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import {
  actionLabel,
  summariseUserAgent,
  type AuditEvent,
} from "@/lib/data/audit-log";

type Props = {
  events: AuditEvent[];
};

/**
 * "Recent activity" table for the Settings → Security tab.
 *
 * Server-rendered to keep the audit data out of any client bundle.
 * Renders the latest 100 events with the columns the user actually
 * wants when investigating: when, what, where (resource), from
 * (IP + browser/OS). A "Download full log" link below the table hits
 * /api/account/audit-export for a complete JSON dump.
 *
 * No GeoIP lookup happens at render time. Showing the raw IP is the
 * honest baseline; a future iteration can add a server-side
 * batch-resolve if we want country labels.
 */
export async function AuditActivity({ events }: Props) {
  const t = await getTranslations("empty");
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Recent activity</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          The last {events.length === 100 ? "100" : events.length} sensitive
          events on your account. We log sign-ins, sensitive settings changes,
          and document actions. See something you don&apos;t recognise? Change
          your password and turn on 2FA.
        </p>
      </div>

      {events.length === 0 ? (
        <EmptyState compact headline={t("audit_headline")} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised">
          <table className="w-full text-[12.5px]">
            <thead className="bg-canvas">
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-muted">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">From</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {events.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-soft tabular-nums">
                    {formatStamp(e.created_at)}
                  </td>
                  <td className="px-3 py-2 text-ink">
                    {actionLabel(e.action)}
                    {e.resource_type ? (
                      <span className="ml-2 text-[11.5px] text-ink-faint">
                        · {e.resource_type}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {e.ip_address ? (
                      <span className="font-mono text-[12px] text-ink-soft">
                        {e.ip_address}
                      </span>
                    ) : (
                      <span className="text-ink-faint">unknown</span>
                    )}
                    <span className="ml-2 text-[11.5px] text-ink-faint">
                      {summariseUserAgent(e.user_agent)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Link
        href="/api/account/audit-export"
        className="inline-flex text-[12.5px] text-brand hover:opacity-80 transition-base"
        prefetch={false}
      >
        Download full log (JSON)
      </Link>
    </section>
  );
}

/** "2026-06-01 14:32 UTC" — short, sortable, unambiguous. */
function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
