import { Topbar } from "@/components/dashboard/topbar";
import { CalendarView } from "@/components/calendar/calendar-view";
import { AddReminderForm } from "@/components/calendar/add-reminder-form";
import { groupComingUp, loadCalendar } from "@/lib/data/calendar";
import {
  getCurrentContext,
  isAccountOwnerInPersonal,
} from "@/lib/data/organizations";

export const metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const [{ entries, spaces }, ctx] = await Promise.all([
    loadCalendar(),
    getCurrentContext(),
  ]);

  const activeSpace = ctx
    ? spaces.find((s) => s.id === ctx.organization.id) ?? null
    : null;
  const activeSpaceId = activeSpace?.id ?? "";

  // God's Eye for calendar follows the same gate as Ask Oria: only the
  // Personal-space owner gets a cross-space view. Everyone else sees
  // only the active space's calendar.
  const crossSpaceAvailable =
    !!ctx && isAccountOwnerInPersonal(ctx) && spaces.length > 1;

  // Compute initial "Coming up" rollup against the active-space slice
  // so the rollup never leaks items from a different space on first
  // paint. Client takes over when the user toggles the scope.
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
