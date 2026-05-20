import { Topbar } from "@/components/dashboard/topbar";
import { Dropzone } from "@/components/upload/dropzone";
import { SparkIcon } from "@/components/ui/icon";

export const metadata = { title: "Diet" };

// Placeholder data — wired to real extractions in a follow-up.
const TODAY_MEALS = [
  {
    time: "08:20",
    title: "Greek yogurt + berries + honey",
    note: "Breakfast at home",
    calories: 320,
    protein: 18,
    carbs: 38,
    fat: 9,
  },
  {
    time: "13:05",
    title: "Chicken bowl, rice, salad",
    note: "Lunch · Erewhon",
    calories: 640,
    protein: 48,
    carbs: 62,
    fat: 22,
  },
  {
    time: "16:30",
    title: "Espresso + a square of dark chocolate",
    note: "Afternoon",
    calories: 90,
    protein: 1,
    carbs: 8,
    fat: 6,
  },
];

const TODAY_TOTAL = TODAY_MEALS.reduce(
  (acc, m) => ({
    calories: acc.calories + m.calories,
    protein: acc.protein + m.protein,
    carbs: acc.carbs + m.carbs,
    fat: acc.fat + m.fat,
  }),
  { calories: 0, protein: 0, carbs: 0, fat: 0 },
);

// Last 7 days, oldest first. Placeholder.
const WEEK = [
  { day: "Mon", calories: 1820 },
  { day: "Tue", calories: 2010 },
  { day: "Wed", calories: 1650 },
  { day: "Thu", calories: 2150 },
  { day: "Fri", calories: 1980 },
  { day: "Sat", calories: 2310 },
  { day: "Today", calories: TODAY_TOTAL.calories },
];

const WEEK_MAX = Math.max(...WEEK.map((d) => d.calories), 1);

export default function DietPage() {
  return (
    <>
      <Topbar title="Diet" />

      <div className="mb-6 flex items-center gap-2 px-1">
        <SmartBadge />
        <p className="text-[12.5px] text-ink-faint">
          Upload meal photos with a short note. Oria estimates the rest.
        </p>
      </div>

      <div className="space-y-9 animate-fade-up">
        <section>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
            Log a meal
          </h2>
          <Dropzone
            heading="Drop a meal photo"
            subheading="Add a short note (e.g. ‘Lunch: chicken, rice, salad’). Click to browse."
          />
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
              Today
            </h2>
            <ul className="rounded-2xl border border-line bg-surface-raised divide-y divide-line">
              {TODAY_MEALS.map((m, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 px-4 py-3"
                >
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-canvas text-[11px] text-ink-muted">
                    {m.time}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] text-ink">{m.title}</p>
                    <p className="truncate text-[11.5px] text-ink-faint">
                      {m.note}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] text-ink">
                      {m.calories.toLocaleString()} cal
                    </p>
                    <p className="text-[11px] text-ink-faint">
                      {m.protein}p · {m.carbs}c · {m.fat}f
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <aside className="space-y-6">
            <DailyTotal total={TODAY_TOTAL} />
          </aside>
        </div>

        <section>
          <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
            Last 7 days
          </h2>
          <div className="rounded-2xl border border-line bg-surface-raised p-4">
            <ul className="flex h-[110px] items-end gap-2">
              {WEEK.map((d) => {
                const h = Math.max(8, Math.round((d.calories / WEEK_MAX) * 100));
                const isToday = d.day === "Today";
                return (
                  <li
                    key={d.day}
                    className="flex flex-1 flex-col items-center gap-1.5"
                  >
                    <span
                      style={{ height: `${h}%` }}
                      className={`w-full rounded-md ${
                        isToday ? "bg-ink" : "bg-sand"
                      }`}
                    />
                    <span
                      className={`text-[10.5px] ${
                        isToday ? "text-ink" : "text-ink-faint"
                      }`}
                    >
                      {d.day}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <p className="px-1 text-[11.5px] text-ink-faint">
          Nutrition estimates are approximate. Treat them as a calm reference,
          not medical advice.
        </p>
      </div>
    </>
  );
}

function DailyTotal({
  total,
}: {
  total: { calories: number; protein: number; carbs: number; fat: number };
}) {
  return (
    <section>
      <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
        Today, at a glance
      </h2>
      <div className="rounded-2xl border border-line bg-surface-raised p-5">
        <p className="text-[11.5px] uppercase tracking-[0.12em] text-ink-faint">
          Calories
        </p>
        <p className="mt-1 text-[32px] font-semibold tracking-tight text-ink">
          {total.calories.toLocaleString()}
        </p>
        <p className="text-[11.5px] text-ink-faint">estimated · today</p>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <Macro label="Protein" value={total.protein} unit="g" tint="text-[#7a4a7a]" />
          <Macro label="Carbs" value={total.carbs} unit="g" tint="text-[#7a5a2a]" />
          <Macro label="Fat" value={total.fat} unit="g" tint="text-[#3a6a8a]" />
        </div>
      </div>
    </section>
  );
}

function Macro({
  label,
  value,
  unit,
  tint,
}: {
  label: string;
  value: number;
  unit: string;
  tint: string;
}) {
  return (
    <div>
      <p className="text-[11px] text-ink-faint">{label}</p>
      <p className={`mt-0.5 text-[15px] font-medium ${tint}`}>
        {value}
        <span className="ml-0.5 text-[11px] text-ink-faint">{unit}</span>
      </p>
    </div>
  );
}

function SmartBadge() {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-full bg-accent-soft/60 px-2 text-[10.5px] font-medium text-[#7a5a2a]">
      <SparkIcon size={10} /> Smart Section
    </span>
  );
}
