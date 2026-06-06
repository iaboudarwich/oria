import { DemoTopbar } from "@/components/demo/demo-shell";
import { Badge, Dot } from "@/components/ui/badge";
import { ArrowRightIcon, CheckIcon, PaperclipIcon, SendIcon } from "@/components/ui/icon";

export const metadata = { title: "Assistant" };

export default function AssistantRolePage() {
  return (
    <>
      <DemoTopbar title="Today, in order" />

      <div className="animate-fade-up space-y-6">
        <Stats />

        <div className="grid gap-5 lg:grid-cols-3">
          <Today />
          <Messages />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Agenda />
          <Waiting />
        </div>
      </div>
    </>
  );
}

function Stats() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { k: "Open threads", v: "11" },
        { k: "Waiting on you", v: "3" },
        { k: "Meetings", v: "4" },
        { k: "New uploads", v: "18" },
      ].map((s) => (
        <div key={s.k} className="rounded-xl border border-line bg-surface-raised p-4">
          <p className="text-[11.5px] text-ink-faint">{s.k}</p>
          <p className="mt-1.5 text-[22px] font-semibold text-ink">{s.v}</p>
        </div>
      ))}
    </div>
  );
}

function Today() {
  const lanes = [
    {
      lane: "Before noon",
      items: [
        { t: "Confirm florist for Paris dinner", w: "11:00", done: false },
        { t: "Send revised crew roster", w: "12:00", done: false },
        { t: "Reply to Mme Lefèvre", w: "12:00", done: true },
      ],
    },
    {
      lane: "Afternoon",
      items: [
        { t: "Coordinate piano tuning, NYC", w: "14:00", done: false },
        { t: "Review art transit options", w: "15:30", done: false },
      ],
    },
    {
      lane: "Before tomorrow",
      items: [
        { t: "Brief Henri on east wing", w: "EOD", done: false },
        { t: "Archive April advisor calls", w: "EOD", done: false },
      ],
    },
  ];
  return (
    <section className="lg:col-span-2">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">Today</h2>
        <Badge tone="champagne">3 due</Badge>
      </div>
      <div className="divide-y divide-line rounded-xl border border-line bg-surface-raised">
        {lanes.map((lane) => (
          <div key={lane.lane} className="px-4 py-3">
            <p className="mb-1.5 text-[11px] text-ink-faint">{lane.lane}</p>
            <ul className="space-y-1">
              {lane.items.map((it) => (
                <li
                  key={it.t}
                  className={`transition-base flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-canvas/50 ${it.done ? "opacity-60" : ""}`}
                >
                  <span
                    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      it.done
                        ? "border-sage bg-sage text-surface"
                        : "border-line-strong text-transparent"
                    }`}
                  >
                    <CheckIcon size={10} />
                  </span>
                  <p
                    className={`flex-1 text-[13px] ${it.done ? "text-ink-muted line-through" : "text-ink"}`}
                  >
                    {it.t}
                  </p>
                  <span className="text-[11px] text-ink-faint">{it.w}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Messages() {
  const threads = [
    { from: "Henri, Gstaad", preview: "Joiner came by this morning.", time: "07:42", unread: true },
    { from: "Capt. Mendez", preview: "May payroll attached.", time: "06:18", unread: true },
    { from: "Vertumne", preview: "Peonies confirmed for the 17th.", time: "Yest", unread: false },
    { from: "Lloyd's", preview: "Three options enclosed.", time: "Yest", unread: false },
    { from: "Steinway NYC", preview: "Wed 14:00 works.", time: "Mon", unread: false },
  ];
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">Messages</h2>
        <Badge tone="neutral">2 unread</Badge>
      </div>
      <div className="divide-y divide-line rounded-xl border border-line bg-surface-raised">
        <ul className="divide-y divide-line">
          {threads.map((t) => (
            <li
              key={t.from}
              className="transition-base flex items-start gap-2.5 px-4 py-2.5 hover:bg-canvas/60"
            >
              <span
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${t.unread ? "bg-accent" : "bg-transparent"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={`truncate text-[13px] ${t.unread ? "text-ink" : "text-ink-soft"}`}>
                    {t.from}
                  </p>
                  <span className="shrink-0 text-[11px] text-ink-faint">{t.time}</span>
                </div>
                <p className="mt-0.5 truncate text-[12px] text-ink-muted">{t.preview}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="p-3">
          <label className="flex items-center gap-2 rounded-lg border border-line bg-canvas/60 px-2.5 py-2">
            <PaperclipIcon size={13} />
            <input
              type="text"
              placeholder="Reply"
              className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-ink-faint"
            />
            <button className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-ink text-surface">
              <SendIcon size={12} />
            </button>
          </label>
        </div>
      </div>
    </section>
  );
}

function Agenda() {
  const items = [
    { time: "09:00", title: "Morning brief", where: "Library" },
    { time: "11:00", title: "Call Vertumne", where: "Paris dinner" },
    { time: "14:00", title: "Walk-through with Henri", where: "Gstaad, phone" },
    { time: "16:30", title: "Trustee touchpoint", where: "Office" },
  ];
  return (
    <section className="lg:col-span-2">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">Diary</h2>
        <span className="text-[12px] text-ink-muted">Tue 18 May</span>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface-raised">
        {items.map((it) => (
          <li
            key={it.time}
            className="transition-base flex items-center gap-4 px-4 py-3 hover:bg-canvas/60"
          >
            <span className="w-12 shrink-0 text-[13px] font-medium text-ink">{it.time}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] text-ink">{it.title}</p>
              <p className="text-[11.5px] text-ink-muted">{it.where}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Waiting() {
  const items = [
    { label: "Florist confirmation", time: "since 09:00" },
    { label: "Crew payroll signature", time: "since 07:30" },
    { label: "Restoration estimate", time: "9 days" },
  ];
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">Waiting on principal</h2>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface-raised">
        {items.map((r) => (
          <li
            key={r.label}
            className="transition-base flex items-center gap-3 px-4 py-3 hover:bg-canvas/60"
          >
            <Dot tone="champagne" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-ink">{r.label}</p>
              <p className="text-[11.5px] text-ink-muted">{r.time}</p>
            </div>
            <button className="transition-base inline-flex h-7 items-center gap-1 rounded-lg bg-ink px-2.5 text-[11.5px] text-surface hover:bg-ink-soft">
              Nudge <ArrowRightIcon size={11} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
