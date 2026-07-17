import { describe, expect, it } from "vitest";
import { dailyQuestionIndex } from "../src/game/daily";

describe("dailyQuestionIndex", () => {
  it("is deterministic for a given day", () => {
    const a = dailyQuestionIndex("2026-07-17", 15);
    const b = dailyQuestionIndex("2026-07-17", 15);
    expect(a).toBe(b);
  });

  it("stays within the pool bounds over a long stretch of days", () => {
    for (let i = 0; i < 365; i++) {
      const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      const idx = dailyQuestionIndex(day, 15);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(15);
    }
  });

  it("varies across days (not constant)", () => {
    const indices = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const day = new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10);
      indices.add(dailyQuestionIndex(day, 15));
    }
    expect(indices.size).toBeGreaterThan(1);
  });

  it("throws on an empty pool", () => {
    expect(() => dailyQuestionIndex("2026-07-17", 0)).toThrow();
  });
});
