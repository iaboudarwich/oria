import { Topbar } from "@/components/dashboard/topbar";
import { CalendarView } from "@/components/calendar/calendar-view";
import { ReminderDialog } from "@/components/calendar/reminder-dialog";
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
        {/* Top-right "Add reminder" opens the detailed reminder form. */}
        <div className="flex justify-end">
          <ReminderDialog scopeName={activeSpace?.name ?? null} />
        </div>

        <CalendarView
          entries={entries}
          spaces={spaces}
          activeSpaceId={activeSpaceId}
          crossSpaceAvailable={crossSpaceAvailable}
          initialComingUp={initialComingUp}
          initialSources={sources}
        />
      </div>
    </>
  );
}
