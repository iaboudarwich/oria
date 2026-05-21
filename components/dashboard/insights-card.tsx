import Link from "next/link";
import { SparkIcon } from "@/components/ui/icon";
import type { Insight } from "@/lib/data/insights";
import { dismissInsight } from "@/lib/data/insights-dismiss-actions";

/**
 * Calm one-line-per-insight strip. Renders nothing when there's
 * nothing to say — proactive intelligence should be useful, not
 * noisy. Each row is dismissable and the dismissal is persisted via
 * a cookie keyed by insight id, so the user is never nagged twice
 * about the same observation.
 *
 * Pattern matches the existing topbar status strip: muted dot,
 * short message, optional inline link.
 */
export function InsightsCard({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
        From Oria
      </h2>
      <ul className="rounded-2xl border border-line bg-surface-raised divide-y divide-line">
        {insights.map((i) => (
          <li
            key={i.id}
            className="flex items-center gap-3 px-4 py-2.5"
          >
            <SparkIcon size={11} />
            {i.href ? (
              <Link
                href={i.href}
                className="min-w-0 flex-1 truncate text-[13px] text-ink transition-base hover:text-ink-soft"
              >
                {i.message}
              </Link>
            ) : (
              <p className="min-w-0 flex-1 truncate text-[13px] text-ink">
                {i.message}
              </p>
            )}
            <form action={dismissInsight}>
              <input type="hidden" name="id" value={i.id} />
              <button
                type="submit"
                aria-label="Dismiss"
                className="cursor-pointer text-[11.5px] text-ink-faint transition-base hover:text-ink"
              >
                Dismiss
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
