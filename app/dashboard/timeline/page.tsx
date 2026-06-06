import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import {
  ApprovalsIcon,
  CalendarIcon,
  GiftIcon,
  HomeIcon,
  PlaneIcon,
  PropertiesIcon,
  SparkIcon,
  StaffIcon,
  UploadIcon,
} from "@/components/ui/icon";
import {
  displayActor,
  groupByDay,
  listTimeline,
  type TimelineEventWithActor,
} from "@/lib/data/timeline";
import { relativeTime } from "@/lib/utils";
import type { EventKind } from "@/lib/supabase/types";

export const metadata = { title: "Timeline" };

export default async function TimelinePage() {
  const events = await listTimeline(100);
  const days = groupByDay(events);

  return (
    <>
      <Topbar title="Timeline" />

      <div className="animate-fade-up space-y-8">
        {days.length === 0 ? (
          <p className="px-1 text-[13px] text-ink-faint">
            Every upload, reminder, and decision will appear here, in order. Nothing gets lost.
          </p>
        ) : (
          days.map((day) => (
            <section key={day.iso}>
              <h2 className="mb-2 px-1 text-[13px] font-medium text-ink-muted">{day.label}</h2>
              <ul className="space-y-0.5">
                {day.entries.map((entry) => (
                  <TimelineRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  );
}

function TimelineRow({ entry }: { entry: TimelineEventWithActor }) {
  const v = visualFor(entry.kind);
  const actorLabel = displayActor(entry.actor);
  const meta = entry.detail ? `${actorLabel} · ${entry.detail}` : actorLabel;

  const content = (
    <>
      <span className={`mt-0.5 ${v.color}`}>
        <v.Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-ink">{entry.title}</p>
        <p className="mt-0.5 truncate text-[12px] text-ink-faint">{meta}</p>
      </div>
      <span className="text-[11px] text-ink-faint">{relativeTime(entry.created_at)}</span>
    </>
  );

  const className =
    "flex items-start gap-3 rounded-lg px-3 py-2 transition-base hover:bg-surface-raised";

  return (
    <li>
      {entry.upload_id ? (
        <Link href={`/dashboard/uploads/${entry.upload_id}`} className={className}>
          {content}
        </Link>
      ) : (
        <div className={className}>{content}</div>
      )}
    </li>
  );
}

function visualFor(kind: EventKind): {
  Icon: React.ComponentType<{ size?: number }>;
  color: string;
} {
  switch (kind) {
    case "upload":
      return { Icon: UploadIcon, color: "text-ink-muted" };
    case "ai":
      return { Icon: SparkIcon, color: "text-[#7a5a2a]" };
    case "reminder":
      return { Icon: CalendarIcon, color: "text-ink-muted" };
    case "approval":
      return { Icon: ApprovalsIcon, color: "text-sage" };
    case "event":
      return { Icon: GiftIcon, color: "text-ink-muted" };
    case "staff":
      return { Icon: StaffIcon, color: "text-ink-muted" };
    case "travel":
      return { Icon: PlaneIcon, color: "text-ink-muted" };
    case "property":
      return { Icon: PropertiesIcon, color: "text-ink-muted" };
    case "household":
      return { Icon: HomeIcon, color: "text-ink-muted" };
    case "schedule":
      return { Icon: CalendarIcon, color: "text-ink-muted" };
  }
}
