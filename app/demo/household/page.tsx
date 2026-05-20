import { DemoTopbar } from "@/components/demo/demo-shell";
import { Badge, Dot } from "@/components/ui/badge";
import {
  CheckIcon,
  HeartIcon,
  HomeIcon,
  PaperclipIcon,
  PersonIcon,
  PlaneIcon,
  SparkIcon,
} from "@/components/ui/icon";

export const metadata = { title: "Household" };

export default function HouseholdRolePage() {
  return (
    <>
      <DemoTopbar title="This week, together" />


      <div className="space-y-6 animate-fade-up">
        <Stats />

        <div className="grid gap-5 lg:grid-cols-3">
          <Tasks />
          <People />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Upcoming />
          <Notes />
        </div>
      </div>
    </>
  );
}

function Stats() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { k: "Together", v: "3 days" },
        { k: "Apart", v: "4 days" },
        { k: "Decisions", v: "2" },
      ].map((s) => (
        <div key={s.k} className="rounded-xl border border-line bg-surface-raised p-4 text-center">
          <p className="text-[11.5px] text-ink-faint">{s.k}</p>
          <p className="mt-1.5 text-[20px] font-semibold text-ink">{s.v}</p>
        </div>
      ))}
    </div>
  );
}

function Tasks() {
  const items = [
    { t: "Choose Friday dinner menu", w: "Both", done: false },
    { t: "Confirm children's flights", w: "Sofia helping", done: false },
    { t: "Pack for Monaco", w: "Together", done: false },
    { t: "Thank-you to Capucine", w: "You", done: true },
    { t: "Decide on Christmas", w: "Long horizon", done: false },
  ];
  return (
    <section className="lg:col-span-2">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">Together</h2>
        <Badge tone="neutral">5</Badge>
      </div>
      <ul className="rounded-xl border border-line bg-surface-raised divide-y divide-line">
        {items.map((it) => (
          <li
            key={it.t}
            className={`flex items-center gap-3 px-4 py-3 transition-base hover:bg-canvas/60 ${it.done ? "opacity-60" : ""}`}
          >
            <span
              className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                it.done
                  ? "border-sage bg-sage text-surface"
                  : "border-line-strong bg-surface-raised text-transparent"
              }`}
            >
              <CheckIcon size={11} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-[13.5px] ${it.done ? "text-ink-muted line-through" : "text-ink"}`}>
                {it.t}
              </p>
              <p className="text-[11.5px] text-ink-muted">{it.w}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function People() {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">Around you</h2>
      </div>
      <ul className="rounded-xl border border-line bg-surface-raised divide-y divide-line">
        {[
          { name: "Antoine", state: "Travelling Tue, Wed", tone: "neutral" as const, Icon: HeartIcon },
          { name: "Madeleine", state: "Arriving Sun", tone: "champagne" as const, Icon: PersonIcon },
          { name: "Théo", state: "Boarding school", tone: "neutral" as const, Icon: PersonIcon },
          { name: "Sofia", state: "Coordinating", tone: "sage" as const, Icon: PersonIcon },
          { name: "Henri", state: "Preparing chalet", tone: "sage" as const, Icon: HomeIcon },
        ].map((p) => (
          <li key={p.name} className="flex items-center gap-2.5 px-4 py-2.5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sand text-ink-soft">
              <p.Icon size={12} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-ink">{p.name}</p>
              <p className="text-[11.5px] text-ink-muted">{p.state}</p>
            </div>
            <Dot tone={p.tone} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Upcoming() {
  const events = [
    { date: "Thu 12", title: "Monaco, Hôtel de Paris", Icon: PlaneIcon },
    { date: "Sat 14", title: "Family lunch, Èze", Icon: HeartIcon },
    { date: "Sun 15", title: "Family arrives", Icon: HomeIcon },
    { date: "Fri 17", title: "Paris dinner", Icon: HeartIcon },
  ];
  return (
    <section className="lg:col-span-2">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">Coming up</h2>
      </div>
      <ul className="rounded-xl border border-line bg-surface-raised divide-y divide-line">
        {events.map((e) => (
          <li key={e.title} className="flex items-center gap-3 px-4 py-3 transition-base hover:bg-canvas/60">
            <span className="w-12 shrink-0 text-[13px] font-medium text-ink">{e.date}</span>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-canvas text-ink-muted">
              <e.Icon size={12} />
            </span>
            <p className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{e.title}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Notes() {
  const notes = [
    { from: "Antoine", text: "Send flowers ahead of the children?" },
    { from: "Oria", text: "Geneva flight on time. Driver as backup." },
    { from: "Madeleine", text: "Bringing two friends Sunday, okay?" },
  ];
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">Notes</h2>
        <Badge tone="champagne">3</Badge>
      </div>
      <div className="rounded-xl border border-line bg-surface-raised">
        <ul className="divide-y divide-line">
          {notes.map((n, i) => (
            <li key={i} className="px-4 py-3">
              <p className="text-[11px] text-ink-faint">{n.from}</p>
              <p className="mt-1 text-[13px] leading-snug text-ink-soft">{n.text}</p>
            </li>
          ))}
        </ul>
        <div className="border-t border-line p-3">
          <label className="flex items-center gap-2 rounded-lg border border-line bg-canvas/60 px-2.5 py-2">
            <PaperclipIcon size={13} />
            <input
              type="text"
              placeholder="Leave a note"
              className="flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-ink-faint"
            />
            <button className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-ink text-surface">
              <SparkIcon size={12} />
            </button>
          </label>
        </div>
      </div>
    </section>
  );
}
