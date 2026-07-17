import { addDays } from "./time";

export interface StreakState {
  current: number;
  best: number;
  lastActiveDay: string | null;
}

/**
 * Advance a streak for activity on `today` (YYYY-MM-DD in the user's tz).
 * Same-day activity is idempotent; consecutive days extend; a gap resets to 1.
 */
export function recordActivity(s: StreakState, today: string): StreakState {
  if (s.lastActiveDay === today) return s;
  const current = s.lastActiveDay === addDays(today, -1) ? s.current + 1 : 1;
  return {
    current,
    best: Math.max(s.best, current),
    lastActiveDay: today,
  };
}
