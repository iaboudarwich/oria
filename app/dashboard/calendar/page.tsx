import { Topbar } from "@/components/dashboard/topbar";
import { CalendarView } from "@/components/calendar/calendar-view";
import { AddReminderForm } from "@/components/calendar/add-reminder-form";
import { groupComingUp, loadCalendar } from "@/lib/data/calendar";
import { getCalendarSources } from "@/lib/data/calendar-prefs";
import { DEFAULT_CALENDAR_SOURCES } from "@/lib/data/calendar-types";
import {
  getCurrentContext,
  isAccountOwnerInPersonal,
} from "@/lib/data/organizations";

export const metadata = { title: "Calendar" };

export default async function CalendarPage() {
  // Fetch context first to decide whether cross-space data is permitted
  // for this user. Only Personal-owners get the God's-Eye option; everyone
  // else (including Workspace members) gets active-org-only data so no
  // Personal/other-Workspace entries can leak into the rendered HTML.
  const ctx = await getCurrentContext();
  const allowCross = !!ctx && isAccountOwnerInPersonal(ctx);
  const { entries, spaces } = await loadCalendar({ crossSpace: allowCross });
  const sources = ctx
    ? await getCalendarSources(ctx.profile.id)
    : DEFAULT_CALENDAR_SOURCES;

  const activeSpace = ctx
    ? spaces.find((s) => s.id === ctx.organization.id) ?? null
    : null;
  const activeSpaceId = activeSpace?.id ?? "";

  // God's Eye visual toggle. Only Personal-owners get to see it. Without
  // it, the calendar shows ONLY the active org's entries because
  // loadCalendar refused to fetch anything else.
  const crossSpaceAvailable = allowCross && spaces.length > 1;

  // Initial "Coming up" rollup: when cross-space was permitted we got
  // entries from every space the user owns; otherwise entries are
  // already active-org-only and this filter is a no-op.
  const activeEntries = activeSpaceId
    ? entries.filter((e) => e.space_id === activeSpaceId)
    : entries;
  const initialComingUp = groupComingUp(activeEntries);

  return (
    <>
      <Topbar title="Calendar" />

      <div className="space-y-6 animate-fade-up">
        <CalendarView
          entries={entries}
          spaces={spaces}
          activeSpaceId={activeSpaceId}
          crossSpaceAvailable={crossSpaceAvailable}
          initialComingUp={initialComingUp}
          initialSources={sources}
        />

        <AddReminder activeSpaceName={activeSpace?.name ?? null} />
      </div>
    </>
  );
}

function AddReminder({ activeSpaceName }: { activeSpaceName: string | null }) {
  return (
    <details className="group rounded-xl border border-line bg-surface-raised">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-[13.5px] text-ink-muted transition-base hover:text-ink group-open:text-ink">
        <span className="text-[14px]">+</span>
        <span>Add reminder</span>
        {activeSpaceName ? (
          <span className="ml-auto text-[11.5px] text-ink-faint">
            adding to {activeSpaceName}
          </span>
        ) : null}
      </summary>
      <AddReminderForm />
    </details>
  );
}
