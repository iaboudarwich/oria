import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import { DropzoneCompact } from "@/components/upload/dropzone-compact";
import { AskChat } from "@/components/ask/ask-chat";
import { SectionMemoryPanel } from "@/components/section/section-memory-panel";
import {
  listDietMeals,
  sumMacros,
  type DietMeal,
  type DietTotals,
} from "@/lib/data/smart-sections";
import { listSectionMemories } from "@/lib/data/section-memory";
import type { SectionScope } from "@/lib/data/section-scope";

export const metadata = { title: "Diet" };

const SCOPE: SectionScope = { kind: "smart", key: "diet", label: "Diet" };
const SUGGESTIONS = [
  "How many calories did I eat today?",
  "How much protein did I have today?",
  "What did I eat yesterday?",
  "Show my meals this week.",
];

export default async function DietPage() {
  // Pull the last 7 days of meals in one shot; partition below.
  const today = startOfDay(new Date());
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const [meals, memories] = await Promise.all([
    listDietMeals({ since: sevenDaysAgo, limit: 200 }),
    listSectionMemories(SCOPE),
  ]);
  const todayMeals = meals.filter((m) => occurredOn(m, today));
  const todayTotals = sumMacros(todayMeals);
  const week = buildWeek(meals);
  const weekMax = Math.max(...week.map((d) => d.calories), 1);

  return (
    <>
      <Topbar title="Diet" />

      <div className="space-y-7 animate-fade-up">
        <DropzoneCompact
          smartSection="diet"
          heading="Drop a meal photo"
          subheading="add a short note, e.g. ‘Lunch: chicken, rice, salad’"
        />

        <section>
          <DailyStrip
            total={todayTotals}
            hasData={todayMeals.length > 0}
            mealCount={todayMeals.length}
          />
          {todayMeals.length === 0 ? null : (
            <ul className="mt-3 rounded-2xl border border-line bg-surface-raised divide-y divide-line">
              {todayMeals.map((m) => (
                <MealRow key={m.id} meal={m} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
            Last 7 days
          </h2>
          <div className="rounded-2xl border border-line bg-surface-raised p-4">
            {week.every((d) => d.calories === 0) ? (
              <p className="px-1 text-[12.5px] text-ink-faint">
                Your weekly chart fills in as you log meals.
              </p>
            ) : (
              <ul className="flex h-[100px] items-end gap-2">
                {week.map((d, i) => {
                  const h =
                    d.calories === 0
                      ? 4
                      : Math.max(8, Math.round((d.calories / weekMax) * 100));
                  const isToday = i === week.length - 1;
                  return (
                    <li
                      key={d.label + i}
                      className="flex flex-1 flex-col items-center gap-1.5"
                    >
                      <span
                        style={{ height: `${h}%` }}
                        className={`w-full rounded-md ${
                          isToday ? "bg-ink" : d.calories > 0 ? "bg-sand" : "bg-line"
                        }`}
                        title={`${d.calories} cal`}
                      />
                      <span
                        className={`text-[10.5px] ${
                          isToday ? "text-ink" : "text-ink-faint"
                        }`}
                      >
                        {d.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
            Ask Diet
          </h2>
          <div className="rounded-2xl border border-line bg-surface-raised p-3">
            <AskChat scope={SCOPE} suggestions={SUGGESTIONS} />
          </div>
        </section>

        <SectionMemoryPanel scope={SCOPE} memories={memories} />

        <p className="px-1 text-[11px] text-ink-faint">
          Nutrition estimates are approximate. Treat them as a calm reference,
          not medical advice.
        </p>
      </div>
    </>
  );
}

function MealRow({ meal: m }: { meal: DietMeal }) {
  const time = m.occurred_at
    ? new Date(m.occurred_at).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : "·";
  const note =
    (m.facts && typeof m.facts === "object" && "user_description" in m.facts
      ? String((m.facts as { user_description?: string }).user_description ?? "")
      : "") ||
    m.summary ||
    (m.items_purchased.length > 0 ? m.items_purchased.join(", ") : "");
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-canvas text-[11px] text-ink-muted">
        {time}
      </span>
      <div className="min-w-0 flex-1">
        {m.upload_id ? (
          <Link
            href={`/dashboard/uploads/${m.upload_id}`}
            className="truncate text-[13.5px] text-ink transition-base hover:text-ink-soft"
          >
            {m.title}
          </Link>
        ) : (
          <p className="truncate text-[13.5px] text-ink">{m.title}</p>
        )}
        {note ? (
          <p className="truncate text-[11.5px] text-ink-faint">{note}</p>
        ) : null}
      </div>
      <div className="text-right">
        {m.calories !== null ? (
          <p className="text-[13px] text-ink">
            {Math.round(m.calories).toLocaleString()} cal
          </p>
        ) : null}
        {m.protein_g !== null || m.carbs_g !== null || m.fat_g !== null ? (
          <p className="text-[11px] text-ink-faint">
            {Math.round(m.protein_g ?? 0)}p · {Math.round(m.carbs_g ?? 0)}c ·{" "}
            {Math.round(m.fat_g ?? 0)}f
          </p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Horizontal totals strip. Reads as one calm row: today's calories on
 * the left, macros on the right. Replaces the old vertical aside card so
 * the meals list takes the full width and the page breathes.
 */
function DailyStrip({
  total,
  hasData,
  mealCount,
}: {
  total: DietTotals;
  hasData: boolean;
  mealCount: number;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-raised p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-baseline gap-3">
        <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
          Today
        </span>
        <span className="text-[26px] font-semibold tracking-tight text-ink">
          {hasData ? Math.round(total.calories).toLocaleString() : "·"}
        </span>
        <span className="text-[12.5px] text-ink-faint">cal</span>
        <span className="text-[11.5px] text-ink-faint">
          {mealCount === 0
            ? "no meals yet"
            : `${mealCount} meal${mealCount === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="flex items-baseline gap-4 sm:gap-5">
        <Macro
          label="P"
          value={hasData ? Math.round(total.protein_g) : null}
          tint="text-[#7a4a7a]"
        />
        <Macro
          label="C"
          value={hasData ? Math.round(total.carbs_g) : null}
          tint="text-[#7a5a2a]"
        />
        <Macro
          label="F"
          value={hasData ? Math.round(total.fat_g) : null}
          tint="text-[#3a6a8a]"
        />
      </div>
    </div>
  );
}

function Macro({
  label,
  value,
  tint,
}: {
  label: string;
  value: number | null;
  tint: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`text-[14px] font-medium ${tint}`}>
        {value ?? "·"}
      </span>
      <span className="text-[10.5px] text-ink-faint">g</span>
      <span className="text-[10.5px] text-ink-muted">{label}</span>
    </span>
  );
}

/* ----- helpers ----------------------------------------------------------- */

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function occurredOn(meal: DietMeal, day: Date): boolean {
  if (!meal.occurred_at) return false;
  const m = new Date(meal.occurred_at);
  return (
    m.getFullYear() === day.getFullYear() &&
    m.getMonth() === day.getMonth() &&
    m.getDate() === day.getDate()
  );
}

type WeekBucket = { label: string; calories: number };

function buildWeek(meals: DietMeal[]): WeekBucket[] {
  const today = startOfDay(new Date());
  const days: WeekBucket[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const label =
      i === 0
        ? "Today"
        : d.toLocaleDateString(undefined, { weekday: "short" });
    const cals = meals
      .filter((m) => occurredOn(m, d))
      .reduce((acc, m) => acc + (m.calories ?? 0), 0);
    days.push({ label, calories: Math.round(cals) });
  }
  return days;
}
