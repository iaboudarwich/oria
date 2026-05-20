import { DemoTopbar } from "@/components/demo/demo-shell";
import { Badge, Dot } from "@/components/ui/badge";
import {
  CheckIcon,
  ClockIcon,
  PaperclipIcon,
  UploadIcon,
} from "@/components/ui/icon";

export const metadata = { title: "Staff" };

export default function StaffRolePage() {
  return (
    <>
      <DemoTopbar title="Welcome, Henri" />


      <div className="space-y-6 animate-fade-up">
        <Stats />

        <div className="grid gap-5 lg:grid-cols-3">
          <Today />
          <Checklist />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Submit />
          <Recent />
        </div>
      </div>
    </>
  );
}

function Stats() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { k: "Tasks", v: "5" },
        { k: "Days until arrival", v: "4" },
        { k: "Open expenses", v: "2" },
      ].map((s) => (
        <div key={s.k} className="rounded-xl border border-line bg-surface-raised p-4 text-center">
          <p className="text-[11.5px] text-ink-faint">{s.k}</p>
          <p className="mt-1.5 text-[20px] font-semibold text-ink">{s.v}</p>
        </div>
      ))}
    </div>
  );
}

function Today() {
  const items = [
    { title: "Walk-through east wing with joiner", time: "10:00", done: false, important: true },
    { title: "Confirm linen delivery for Sunday", time: "11:30", done: false, important: false },
    { title: "Stock pantry for arrival", time: "13:00", done: false, important: false },
    { title: "Pick up restored frames", time: "15:00", done: true, important: false },
    { title: "Brief Anneke on art inventory", time: "16:30", done: false, important: false },
  ];
  return (
    <section className="lg:col-span-2">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">My day</h2>
        <span className="text-[12px] text-ink-muted">Tue 18 May</span>
      </div>
      <ul className="rounded-xl border border-line bg-surface-raised divide-y divide-line">
        {items.map((it) => (
          <li
            key={it.title}
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
                {it.title}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                <ClockIcon size={11} /> {it.time}
                {it.important && (
                  <>
                    <span>,</span>
                    <span className="text-claret">needs your eye</span>
                  </>
                )}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Checklist() {
  const checks = [
    { label: "Heating tested", done: true },
    { label: "Pantry stocked", done: false },
    { label: "Linens turned", done: false },
    { label: "Vehicles serviced", done: true },
    { label: "Garden tidied", done: false },
    { label: "Florist booked", done: true },
  ];
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">Arrival, in 4 days</h2>
        <Badge tone="champagne">3 / 6</Badge>
      </div>
      <ul className="rounded-xl border border-line bg-surface-raised divide-y divide-line">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2.5 px-4 py-2.5">
            <span
              className={`inline-flex h-4 w-4 items-center justify-center rounded border ${
                c.done
                  ? "border-sage bg-sage text-surface"
                  : "border-line-strong bg-surface-raised text-transparent"
              }`}
            >
              <CheckIcon size={10} />
            </span>
            <span className={`flex-1 text-[13px] ${c.done ? "text-ink-muted line-through" : "text-ink"}`}>
              {c.label}
            </span>
            {c.done && <Dot tone="sage" />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Submit() {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">Submit expense</h2>
      </div>
      <div className="rounded-xl border border-line bg-surface-raised p-5">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-canvas/50 px-4 py-6 text-[13px] text-ink-muted transition-base hover:border-ink-muted hover:text-ink"
        >
          <UploadIcon size={15} />
          Drop a receipt
        </button>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <select className="h-10 w-full appearance-none rounded-lg border border-line bg-surface-raised px-3 text-[13px] text-ink outline-none focus:border-ink-muted">
            <option>Maintenance</option>
            <option>Grounds</option>
            <option>Hospitality</option>
            <option>Vehicles</option>
          </select>
          <select className="h-10 w-full appearance-none rounded-lg border border-line bg-surface-raised px-3 text-[13px] text-ink outline-none focus:border-ink-muted">
            <option>Gstaad</option>
            <option>Paris</option>
            <option>Mustique</option>
            <option>New York</option>
          </select>
        </div>
        <button className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-ink text-[13px] text-surface hover:bg-ink-soft transition-base">
          <PaperclipIcon size={13} /> Submit
        </button>
      </div>
    </section>
  );
}

function Recent() {
  const items = [
    { vendor: "Coopérative Gstaad", what: "Pantry, weekly", amount: "CHF 412", state: "Approved", tone: "sage" as const },
    { vendor: "Joiner, east wing", what: "Hardware", amount: "CHF 248", state: "Review", tone: "champagne" as const },
    { vendor: "Florist, village", what: "Arrival", amount: "CHF 380", state: "Approved", tone: "sage" as const },
    { vendor: "Garage Aebi", what: "Range Rover service", amount: "CHF 1,140", state: "Filed", tone: "neutral" as const },
  ];
  return (
    <section className="lg:col-span-2">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">Recent expenses</h2>
      </div>
      <ul className="rounded-xl border border-line bg-surface-raised divide-y divide-line">
        {items.map((it) => (
          <li key={it.vendor} className="flex items-center gap-3 px-4 py-3 transition-base hover:bg-canvas/60">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-ink-muted">
              <PaperclipIcon size={12} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] text-ink">{it.vendor}</p>
              <p className="text-[11.5px] text-ink-muted">{it.what}</p>
            </div>
            <span className="text-[13px] font-medium text-ink">{it.amount}</span>
            <Badge tone={it.tone}>{it.state}</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
