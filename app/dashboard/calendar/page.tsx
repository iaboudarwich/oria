import { Topbar } from "@/components/dashboard/topbar";
import { CalendarView } from "@/components/calendar/calendar-view";
import { loadCalendar } from "@/lib/data/calendar";
import { getCurrentContext } from "@/lib/data/organizations";
import { createReminder } from "@/lib/data/reminder-actions";

export const metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const [{ entries, spaces }, ctx] = await Promise.all([
    loadCalendar(),
    getCurrentContext(),
  ]);

  const activeSpace = ctx
    ? spaces.find((s) => s.id === ctx.organization.id) ?? null
    : null;

  return (
    <>
      <Topbar title="Calendar" />

      <div className="mb-6 max-w-xl px-1 text-[13px] text-ink-muted">
        Your reminders, payments, flights, and events in one place. Filter by
        space or category.
      </div>

      <div className="space-y-6 animate-fade-up">
        <AddReminder activeSpaceName={activeSpace?.name ?? null} />

        <CalendarView
          entries={entries}
          spaces={spaces}
          activeSpaceId={activeSpace?.id ?? ""}
        />
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
      <form
        action={createReminder}
        className="flex flex-col gap-2 border-t border-line p-3 sm:flex-row sm:items-center"
      >
        <input
          type="text"
          name="title"
          required
          autoFocus
          placeholder="What to remember"
          className="h-10 flex-1 rounded-lg bg-canvas/60 px-3 text-[13.5px] text-ink placeholder:text-ink-faint outline-none focus:bg-canvas"
        />
        <input
          type="date"
          name="date"
          required
          className="h-10 rounded-lg border border-line bg-canvas px-2 text-[12.5px] text-ink-soft outline-none focus:border-ink-muted sm:w-[140px]"
        />
        <input
          type="time"
          name="time"
          className="h-10 rounded-lg border border-line bg-canvas px-2 text-[12.5px] text-ink-soft outline-none focus:border-ink-muted sm:w-[110px]"
        />
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-ink px-4 text-[13px] text-surface hover:bg-ink-soft transition-base"
        >
          Add
        </button>
      </form>
    </details>
  );
}
