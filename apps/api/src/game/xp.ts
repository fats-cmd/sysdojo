export type Difficulty = 1 | 2 | 3;

const BASE_XP: Record<Difficulty, number> = { 1: 10, 2: 15, 3: 20 };

/** Consolation XP for a wrong answer — showing up still counts. */
export const WRONG_ANSWER_XP = 2;

/** Combo bonus is +2 XP per consecutive correct answer, capped at 5 stacks. */
export const COMBO_BONUS_PER_STACK = 2;
export const MAX_COMBO_STACKS = 5;

export function xpForAnswer(opts: {
  correct: boolean;
  difficulty: Difficulty;
  /** Consecutive-correct count BEFORE this answer. */
  comboBefore: number;
  /** Review answers earn half base XP. */
  isReview?: boolean;
}): number {
  if (!opts.correct) return WRONG_ANSWER_XP;
  const base = opts.isReview
    ? Math.ceil(BASE_XP[opts.difficulty] / 2)
    : BASE_XP[opts.difficulty];
  const bonus = COMBO_BONUS_PER_STACK * Math.min(opts.comboBefore, MAX_COMBO_STACKS);
  return base + bonus;
}

/** XP required to advance FROM `level` to the next one. */
export function xpToAdvance(level: number): number {
  return 50 + (level - 1) * 25;
}

export function levelFromTotalXp(totalXp: number): {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
} {
  let level = 1;
  let rest = totalXp;
  while (rest >= xpToAdvance(level)) {
    rest -= xpToAdvance(level);
    level += 1;
  }
  return { level, xpIntoLevel: rest, xpForNextLevel: xpToAdvance(level) };
}
