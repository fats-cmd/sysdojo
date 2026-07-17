import { describe, expect, it } from "vitest";
import {
  levelFromTotalXp,
  WRONG_ANSWER_XP,
  xpForAnswer,
  xpToAdvance,
} from "../src/game/xp";

describe("xpForAnswer", () => {
  it("scales base XP with difficulty", () => {
    expect(xpForAnswer({ correct: true, difficulty: 1, comboBefore: 0 })).toBe(10);
    expect(xpForAnswer({ correct: true, difficulty: 2, comboBefore: 0 })).toBe(15);
    expect(xpForAnswer({ correct: true, difficulty: 3, comboBefore: 0 })).toBe(20);
  });

  it("adds +2 per combo stack", () => {
    expect(xpForAnswer({ correct: true, difficulty: 1, comboBefore: 3 })).toBe(16);
  });

  it("caps the combo bonus at 5 stacks", () => {
    expect(xpForAnswer({ correct: true, difficulty: 1, comboBefore: 5 })).toBe(20);
    expect(xpForAnswer({ correct: true, difficulty: 1, comboBefore: 50 })).toBe(20);
  });

  it("awards consolation XP for wrong answers regardless of combo", () => {
    expect(xpForAnswer({ correct: false, difficulty: 3, comboBefore: 9 })).toBe(
      WRONG_ANSWER_XP,
    );
  });

  it("halves base XP for reviews (rounded up) and keeps the combo bonus", () => {
    expect(xpForAnswer({ correct: true, difficulty: 2, comboBefore: 0, isReview: true })).toBe(8);
    expect(xpForAnswer({ correct: true, difficulty: 1, comboBefore: 2, isReview: true })).toBe(9);
  });
});

describe("level curve", () => {
  it("requires progressively more XP per level", () => {
    expect(xpToAdvance(1)).toBe(50);
    expect(xpToAdvance(2)).toBe(75);
    expect(xpToAdvance(3)).toBe(100);
  });

  it("computes level and progress from total XP", () => {
    expect(levelFromTotalXp(0)).toEqual({ level: 1, xpIntoLevel: 0, xpForNextLevel: 50 });
    expect(levelFromTotalXp(49)).toEqual({ level: 1, xpIntoLevel: 49, xpForNextLevel: 50 });
    expect(levelFromTotalXp(50)).toEqual({ level: 2, xpIntoLevel: 0, xpForNextLevel: 75 });
    expect(levelFromTotalXp(124)).toEqual({ level: 2, xpIntoLevel: 74, xpForNextLevel: 75 });
    expect(levelFromTotalXp(125)).toEqual({ level: 3, xpIntoLevel: 0, xpForNextLevel: 100 });
  });
});
