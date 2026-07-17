/**
 * Deterministic daily question selection: FNV-1a hash of the user's day
 * string mod pool size. Everyone whose local calendar shows the same date
 * gets the same question, with no stored schedule.
 */
export function dailyQuestionIndex(day: string, poolSize: number): number {
  if (poolSize <= 0) throw new Error("question pool is empty");
  let h = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % poolSize;
}
