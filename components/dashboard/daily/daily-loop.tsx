import { getTranslations } from "next-intl/server";
import { SparkIcon, CalendarIcon } from "@/components/ui/icon";
import type { DailyLoopData } from "@/lib/daily/today-data";
import { OvercommitWarning } from "./overcommit-warning";
import { RolloverCards } from "./rollover-cards";
import { SuggestionList } from "./suggestion-list";

/**
 * The intelligent daily loop on Today: the overcommitment warning, today's
 * routine outputs (Morning Briefing and friends), tonight's journal, items
 * carried from yesterday, and grounded suggestions. Server-rendered; the
 * interactive pieces are client children.
 */
export async function DailyLoop({
  data,
  organizationId,
}: {
  data: DailyLoopData;
  organizationId: string;
}) {
  const t = await getTranslations("dailyLoop");

  const hasAnything =
    data.overcommit ||
    data.routineCards.length > 0 ||
    data.journalBody ||
    data.rollovers.length > 0 ||
    data.suggestions.length > 0;
  if (!hasAnything) return null;

  return (
    <div className="space-y-5">
      {data.overcommit ? (
        <OvercommitWarning
          organizationId={organizationId}
          meetingCount={data.overcommit.meetingCount}
          meetingHours={data.overcommit.meetingHours}
          holdStartsAt={data.overcommit.suggestedHold?.startsAt ?? null}
        />
      ) : null}

      {data.routineCards.map((r) => (
        <article
          key={r.id}
          className="rounded-2xl border border-line bg-surface-raised px-4 py-3.5"
        >
          <div className="flex items-center gap-2 text-ink-muted">
            <span className="text-brand" aria-hidden>
              <SparkIcon size={16} />
            </span>
            <h2 className="text-[12px] font-medium tracking-wide uppercase">
              {t(`kind_${r.kind}`)}
            </h2>
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed whitespace-pre-line text-ink">
            {r.summary}
          </p>
        </article>
      ))}

      {data.journalBody ? (
        <article className="rounded-2xl border border-line bg-surface-raised px-4 py-3.5">
          <div className="flex items-center gap-2 text-ink-muted">
            <span className="text-brand" aria-hidden>
              <CalendarIcon size={16} />
            </span>
            <h2 className="text-[12px] font-medium tracking-wide uppercase">
              {t("journal_label")}
            </h2>
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed whitespace-pre-line text-ink">
            {data.journalBody}
          </p>
        </article>
      ) : null}

      {data.rollovers.length > 0 ? <RolloverCards cards={data.rollovers} /> : null}

      {data.suggestions.length > 0 ? (
        <SuggestionList suggestions={data.suggestions} organizationId={organizationId} />
      ) : null}
    </div>
  );
}
