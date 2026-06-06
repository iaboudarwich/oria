import type { SignalEvent } from "./signals";

/**
 * F5: overcommitment detection. A day is overcommitted when the timed meeting
 * load is heavy, by either of two sensible measures: too many timed events, or
 * too many total meeting hours. Pure and thresholded so it can be unit-tested
 * and tuned without touching the surface.
 *
 * The folded-in #6 action lives here too: when overcommitted, Today offers to
 * block a focus-time hold (a real reminder), so the warning is actionable
 * rather than passive.
 */

export const OVERCOMMIT_EVENT_THRESHOLD = 5;
export const OVERCOMMIT_HOURS_THRESHOLD = 6;

export type OvercommitAssessment = {
  overcommitted: boolean;
  meetingCount: number;
  meetingHours: number;
  /** The largest open gap between meetings, if any, as ISO start/end. */
  suggestedHold: { startsAt: string; endsAt: string } | null;
};

const HOUR_MS = 60 * 60 * 1000;

export function assessOvercommitment(events: SignalEvent[]): OvercommitAssessment {
  const timed = events
    .filter((e) => !e.isAllDay && e.endsAt)
    .map((e) => ({
      s: new Date(e.startsAt).getTime(),
      n: new Date(e.endsAt as string).getTime(),
    }))
    .filter((x) => !Number.isNaN(x.s) && !Number.isNaN(x.n) && x.n > x.s)
    .sort((a, b) => a.s - b.s);

  const meetingCount = timed.length;
  const meetingHours =
    Math.round((timed.reduce((sum, x) => sum + (x.n - x.s), 0) / HOUR_MS) * 10) / 10;

  // Largest gap between consecutive meetings becomes the suggested focus hold.
  let suggestedHold: { startsAt: string; endsAt: string } | null = null;
  let bestGap = 0;
  for (let i = 1; i < timed.length; i++) {
    const gap = timed[i].s - timed[i - 1].n;
    if (gap > bestGap) {
      bestGap = gap;
      suggestedHold = {
        startsAt: new Date(timed[i - 1].n).toISOString(),
        endsAt: new Date(timed[i].s).toISOString(),
      };
    }
  }

  const overcommitted =
    meetingCount >= OVERCOMMIT_EVENT_THRESHOLD || meetingHours >= OVERCOMMIT_HOURS_THRESHOLD;

  return { overcommitted, meetingCount, meetingHours, suggestedHold };
}
