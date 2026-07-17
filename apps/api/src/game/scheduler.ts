import { addDays } from "./time";

/**
 * Spaced-repetition schedule (SM-2 lite) for missed questions.
 * A miss enters the queue at interval 0; each correct review advances one
 * interval; a wrong review resets to interval 0. Past the last interval the
 * item graduates out of the queue.
 */
export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30] as const;

export interface ScheduledReview {
  intervalIndex: number;
  dueDay: string;
}

export function scheduleAfterMiss(today: string): ScheduledReview {
  return { intervalIndex: 0, dueDay: addDays(today, REVIEW_INTERVALS_DAYS[0]) };
}

export function scheduleAfterReview(
  intervalIndex: number,
  correct: boolean,
  today: string,
): ScheduledReview | { graduated: true } {
  if (!correct) return scheduleAfterMiss(today);
  const next = intervalIndex + 1;
  const interval = REVIEW_INTERVALS_DAYS[next];
  if (interval === undefined) return { graduated: true };
  return { intervalIndex: next, dueDay: addDays(today, interval) };
}
