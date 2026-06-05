import { listRituals } from "@/lib/data/rituals";
import { RitualsClient, type RitualVM } from "./rituals-client";

/**
 * Rituals: recurring habits with streaks and a streak freeze (Round 17.x).
 * Server-fetches the user's rituals with their computed streaks, then hands a
 * serializable view to the client manager (create/edit, tap-to-done, voice/text
 * mark-done). Streak math + the freeze rule live in lib/rituals/streak.ts.
 */
export async function RitualsPanel() {
  const rituals = await listRituals();
  const vms: RitualVM[] = rituals.map((r) => ({
    id: r.id,
    title: r.title,
    cadence: r.cadence,
    days: r.days,
    reminderTime: r.reminder_time,
    current: r.streak.current,
    best: r.streak.best,
    freezes: r.streak.freezes,
    scheduledToday: r.streak.scheduledToday,
    doneToday: r.streak.doneToday,
  }));
  return <RitualsClient rituals={vms} />;
}
