/**
 * Timezone-aware "day" helpers. A user's day is a YYYY-MM-DD string computed
 * in their IANA timezone — never server time. All streak/daily/review logic
 * operates on these day strings, which keeps it pure and testable.
 */

export function dayString(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined || Number.isNaN(y + m + d)) {
    throw new Error(`invalid day string: ${day}`);
  }
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
