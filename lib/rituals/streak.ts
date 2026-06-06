/**
 * Ritual streak math. Pure, deterministic, timezone-correct, fully unit-tested.
 *
 * All inputs are LOCAL day keys ("YYYY-MM-DD") computed in the user's timezone
 * by the caller (getLocalParts), so this module never touches Date zones: it
 * walks calendar days and decides cadence + completion purely on the keys.
 *
 * Cadence: "daily" counts every day; "weekly" counts only the chosen weekdays
 * (0=Sun..6=Sat), so a weekday-only ritual never breaks on a day it wasn't
 * scheduled.
 *
 * FREEZE RULE (documented in CLAUDE.md):
 *   - You earn ONE freeze for every 7 completed scheduled days, capped at 3.
 *   - A missed scheduled day in the PAST consumes one freeze if available, and
 *     the streak survives (the frozen day does not add to the streak). With no
 *     freeze available, the missed day breaks the streak (resets to 0).
 *   - Today, while still in progress, is never a "miss": if not yet done it
 *     leaves the streak as-is (pending), it does not consume a freeze.
 */

export const FREEZE_PER_COMPLETIONS = 7;
export const FREEZE_CAP = 3;

// Safety bound on how far back the walk reaches (a streak older than this is not
// counted). Generous so it never affects realistic use; keeps the loop finite.
const MAX_LOOKBACK_DAYS = 800;

export type Cadence = "daily" | "weekly";

export type StreakInput = {
  cadence: Cadence;
  /** Scheduled weekdays for "weekly" (0=Sun..6=Sat). Ignored for "daily". */
  days: number[];
  /** Local day the ritual started (created), "YYYY-MM-DD". */
  startYmd: string;
  /** The user's local today, "YYYY-MM-DD". */
  todayYmd: string;
  /** Set of local day keys the ritual was marked done. */
  completed: Set<string>;
};

export type StreakResult = {
  current: number;
  best: number;
  /** Freezes available right now. */
  freezes: number;
  scheduledToday: boolean;
  doneToday: boolean;
  /** Past scheduled days a freeze saved (most recent last). */
  frozenMissDates: string[];
};

/* --- local-day-key helpers (no timezone math) ---------------------------- */

function parts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split("-").map(Number);
  return [y, m, d];
}

/** Weekday of a calendar day key (0=Sun). Built in UTC so it is zone-free. */
export function weekdayOf(ymd: string): number {
  const [y, m, d] = parts(ymd);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Add n days to a day key, returning a day key. */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = parts(ymd);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000);
  return t.toISOString().slice(0, 10);
}

/** Is this ritual scheduled on the given weekday? */
export function isScheduledOn(cadence: Cadence, days: number[], dayOfWeek: number): boolean {
  if (cadence === "daily") return true;
  return days.includes(dayOfWeek);
}

/** Is this ritual scheduled on the given day key? */
export function isScheduledOnDay(cadence: Cadence, days: number[], ymd: string): boolean {
  return isScheduledOn(cadence, days, weekdayOf(ymd));
}

/** Compute current + best streak and remaining freezes. */
export function computeStreak(input: StreakInput): StreakResult {
  const { cadence, days, todayYmd, completed } = input;
  // Clamp the start so the walk is always finite.
  const floor = addDays(todayYmd, -MAX_LOOKBACK_DAYS);
  const start = input.startYmd > floor ? input.startYmd : floor;

  let streak = 0;
  let best = 0;
  let freezes = 0;
  let completedCount = 0;
  const frozenMissDates: string[] = [];

  if (start <= todayYmd) {
    for (let d = start; d <= todayYmd; d = addDays(d, 1)) {
      if (!isScheduledOnDay(cadence, days, d)) continue; // not a scheduled day
      const done = completed.has(d);
      if (done) {
        streak += 1;
        completedCount += 1;
        if (completedCount % FREEZE_PER_COMPLETIONS === 0 && freezes < FREEZE_CAP) {
          freezes += 1;
        }
        if (streak > best) best = streak;
      } else if (d === todayYmd) {
        // Today, still in progress: pending, not a miss.
      } else if (freezes > 0) {
        freezes -= 1;
        frozenMissDates.push(d);
        if (streak > best) best = streak;
      } else {
        streak = 0;
      }
    }
  }

  return {
    current: streak,
    best,
    freezes,
    scheduledToday: isScheduledOnDay(cadence, days, todayYmd),
    doneToday: completed.has(todayYmd),
    frozenMissDates,
  };
}

/* --- voice/text "mark done" matcher -------------------------------------- */

const STOP_WORDS = new Set([
  "i",
  "did",
  "do",
  "done",
  "my",
  "the",
  "a",
  "mark",
  "as",
  "complete",
  "completed",
  "finish",
  "finished",
  "for",
  "today",
  "log",
  "just",
  "ritual",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w));
}

/**
 * Match free text ("mark meditate done", "did my reading") to a ritual by name.
 * Deterministic, no AI: picks the ritual whose title shares the most tokens with
 * the text, requiring at least one shared word. Ties and zero matches return
 * null so the caller can ask the user to be more specific.
 */
export function matchRitualByText<T extends { id: string; title: string }>(
  text: string,
  rituals: T[],
): T | null {
  const textTokens = new Set(tokens(text));
  if (textTokens.size === 0) return null;
  let best: T | null = null;
  let bestScore = 0;
  let tie = false;
  for (const r of rituals) {
    const rt = tokens(r.title);
    if (rt.length === 0) continue;
    let score = 0;
    for (const w of rt) if (textTokens.has(w)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = r;
      tie = false;
    } else if (score === bestScore && score > 0) {
      tie = true;
    }
  }
  if (bestScore === 0 || tie) return null;
  return best;
}
