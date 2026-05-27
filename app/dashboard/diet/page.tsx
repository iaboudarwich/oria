import Link from "next/link";
import { cookies } from "next/headers";
import { Topbar } from "@/components/dashboard/topbar";
import { DropzoneCompact } from "@/components/upload/dropzone-compact";
import { TextLogForm } from "@/components/section/text-log-form";
import { AskChat } from "@/components/ask/ask-chat";
import { SectionMemoryPanel } from "@/components/section/section-memory-panel";
import {
  listDietMeals,
  sumMacros,
  type DietMeal,
  type DietTotals,
} from "@/lib/data/smart-sections";
import { listSectionMemories } from "@/lib/data/section-memory";
import { listRecentUserQuestions } from "@/lib/data/recent-questions";
import { sameDayInTz, startOfDayInTz } from "@/lib/utils/tz";
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
  // Compute day boundaries against the user's local timezone (set by
  // TimezoneCookie on first dashboard mount), not the server's. Without
  // this, a meal logged at 11pm Pacific would show up on the wrong
  // calendar day for the Today view + week chart.
  const tz = (await cookies()).get("oria_tz")?.value ?? "UTC";
  const now = new Date();
  const today = startOfDayInTz(now, tz);
  const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

  const [meals, memories, recentQuestions] = await Promise.all([
    listDietMeals({ since: sevenDaysAgo, limit: 200 }),
    listSectionMemories(SCOPE),
    listRecentUserQuestions({ surface: "ask", scope: SCOPE, limit: 3 }),
  ]);
  const yesterdayProbe = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const todayMeals = meals.filter((m) =>
    m.occurred_at ? sameDayInTz(new Date(m.occurred_at), now, tz) : false,
  );
  const yesterdayMeals = meals.filter((m) =>
    m.occurred_at
      ? sameDayInTz(new Date(m.occurred_at), yesterdayProbe, tz)
      : false,
  );
  const todayTotals = sumMacros(todayMeals);
  const yesterdayTotals = sumMacros(yesterdayMeals);
  const weekTotals = sumMacros(meals);
  const week = buildWeek(meals, now, tz);
  const weekMax = Math.max(...week.map((d) => d.calories), 1);
  const daysWithMeals = week.filter((d) => d.calories > 0).length;
  const dailyAverageCalories =
    daysWithMeals > 0
      ? Math.round(weekTotals.calories / daysWithMeals)
      : 0;

  return (
    <>
      <Topbar title="Diet" />

      <div className="space-y-7 animate-fade-up">
        <DropzoneCompact
          smartSection="diet"
          heading="Drop a meal photo"
          subheading="add a short note, e.g. ‘Lunch: chicken, rice, salad’"
        />

        <TextLogForm
          smartSection="diet"
          placeholder="Or describe what you ate — ‘1.5 cups pasta with 2 fried eggs and parmesan’"
          label="Log a meal by text"
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

        {yesterdayMeals.length > 0 ? (
          <section>
            <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
              Yesterday
            </h2>
            <DaySummary
              total={yesterdayTotals}
              mealCount={yesterdayMeals.length}
            />
            <ul className="mt-3 rounded-2xl border border-line bg-surface-raised divide-y divide-line">
              {yesterdayMeals.map((m) => (
                <MealRow key={m.id} meal={m} />
              ))}
            </ul>
          </section>
        ) : null}

        {weekTotals.calories > 0 ? (
          <section>
            <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
              Last 7 days, totals
            </h2>
            <div className="rounded-2xl border border-line bg-surface-raised p-4">
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                <span className="text-[26px] font-semibold tracking-tight text-ink">
                  {weekTotals.calories.toLocaleString()}
                </span>
                <span className="text-[12.5px] text-ink-faint">cal total</span>
                <span className="text-[12.5px] text-ink-muted">
                  ~{dailyAverageCalories.toLocaleString()} cal/day across{" "}
                  {daysWithMeals} day{daysWithMeals === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[12.5px] text-ink-muted">
                {weekTotals.protein_g > 0 ? (
                  <span>{Math.round(weekTotals.protein_g)}g protein</span>
                ) : null}
                {weekTotals.carbs_g > 0 ? (
                  <span>{Math.round(weekTotals.carbs_g)}g carbs</span>
                ) : null}
                {weekTotals.fat_g > 0 ? (
                  <span>{Math.round(weekTotals.fat_g)}g fat</span>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

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
            <AskChat
              scope={SCOPE}
              suggestions={SUGGESTIONS}
              recentQuestions={recentQuestions}
            />
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

/**
 * Compact one-line totals card for a single past day (Yesterday).
 * Mirrors the look of DailyStrip but smaller and without the empty
 * state — only rendered when meals exist.
 */
function DaySummary({
  total,
  mealCount,
}: {
  total: DietTotals;
  mealCount: number;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface-raised p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-baseline gap-3">
        <span className="text-[22px] font-semibold tracking-tight text-ink">
          {Math.round(total.calories).toLocaleString()}
        </span>
        <span className="text-[11.5px] text-ink-faint">cal</span>
        <span className="text-[11.5px] text-ink-muted">
          {mealCount} meal{mealCount === 1 ? "" : "s"}
        </span>
      </div>
      {total.protein_g > 0 || total.carbs_g > 0 || total.fat_g > 0 ? (
        <div className="flex items-baseline gap-4 text-[11.5px] text-ink-muted">
          {total.protein_g > 0 ? (
            <span>{Math.round(total.protein_g)}g protein</span>
          ) : null}
          {total.carbs_g > 0 ? (
            <span>{Math.round(total.carbs_g)}g carbs</span>
          ) : null}
          {total.fat_g > 0 ? (
            <span>{Math.round(total.fat_g)}g fat</span>
          ) : null}
        </div>
      ) : null}
    </div>
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
            className="block truncate text-[13.5px] text-ink transition-base hover:text-ink-soft"
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
 *
 * Empty state: one short line, no macro chips — fewer dots, less noise.
 * Partial state (a meal logged but no macros from AI): show calories
 * and hide the zero-macro chips instead of rendering "·" placeholders.
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
  if (!hasData) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface-raised p-4">
        <div className="flex items-baseline gap-3">
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
            Today
          </span>
          <span className="text-[13.5px] text-ink-muted">
            No meals logged yet
          </span>
        </div>
        <span className="text-[11.5px] text-ink-faint">
          Drop a meal photo above to start.
        </span>
      </div>
    );
  }
  const macros: Array<{ label: string; value: number; tint: string }> = [];
  if (total.protein_g > 0)
    macros.push({
      label: "Protein",
      value: Math.round(total.protein_g),
      tint: "text-[#7a4a7a]",
    });
  if (total.carbs_g > 0)
    macros.push({
      label: "Carbs",
      value: Math.round(total.carbs_g),
      tint: "text-[#7a5a2a]",
    });
  if (total.fat_g > 0)
    macros.push({
      label: "Fat",
      value: Math.round(total.fat_g),
      tint: "text-[#3a6a8a]",
    });
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-raised p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-baseline gap-3">
        <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
          Today
        </span>
        <span className="text-[26px] font-semibold tracking-tight text-ink">
          {Math.round(total.calories).toLocaleString()}
        </span>
        <span className="text-[12.5px] text-ink-faint">cal</span>
        <span className="text-[11.5px] text-ink-faint">
          {mealCount} meal{mealCount === 1 ? "" : "s"}
        </span>
      </div>
      {macros.length > 0 ? (
        <div className="flex items-baseline gap-4 sm:gap-5">
          {macros.map((m) => (
            <span key={m.label} className="inline-flex items-baseline gap-1">
              <span className={`text-[14px] font-medium ${m.tint}`}>
                {m.value}
              </span>
              <span className="text-[10.5px] text-ink-faint">g</span>
              <span className="text-[10.5px] text-ink-muted">{m.label}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ----- helpers ----------------------------------------------------------- */

type WeekBucket = { label: string; calories: number };

function buildWeek(meals: DietMeal[], now: Date, tz: string): WeekBucket[] {
  const todayStart = startOfDayInTz(now, tz);
  const days: WeekBucket[] = [];
  for (let i = 6; i >= 0; i--) {
    // Step back i*24h, then snap to that day's local midnight in tz so
    // DST boundaries don't move the bucket edge mid-week.
    const probe = new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000);
    const label =
      i === 0
        ? "Today"
        : new Intl.DateTimeFormat(undefined, {
            weekday: "short",
            timeZone: tz === "" ? "UTC" : tz,
          }).format(probe);
    const cals = meals
      .filter((m) =>
        m.occurred_at
          ? sameDayInTz(new Date(m.occurred_at), probe, tz)
          : false,
      )
      .reduce((acc, m) => acc + (m.calories ?? 0), 0);
    days.push({ label, calories: Math.round(cals) });
  }
  return days;
}
