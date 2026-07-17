import { describe, expect, it } from "vitest";
import {
  REVIEW_INTERVALS_DAYS,
  scheduleAfterMiss,
  scheduleAfterReview,
} from "../src/game/scheduler";

describe("scheduleAfterMiss", () => {
  it("schedules the first review for the next day", () => {
    expect(scheduleAfterMiss("2026-07-17")).toEqual({
      intervalIndex: 0,
      dueDay: "2026-07-18",
    });
  });
});

describe("scheduleAfterReview", () => {
  it("advances through the interval ladder on correct answers", () => {
    expect(scheduleAfterReview(0, true, "2026-07-18")).toEqual({
      intervalIndex: 1,
      dueDay: "2026-07-21", // +3 days
    });
    expect(scheduleAfterReview(1, true, "2026-07-21")).toEqual({
      intervalIndex: 2,
      dueDay: "2026-07-28", // +7 days
    });
  });

  it("graduates after the last interval", () => {
    const last = REVIEW_INTERVALS_DAYS.length - 1;
    expect(scheduleAfterReview(last, true, "2026-07-17")).toEqual({ graduated: true });
  });

  it("resets to the first interval on a wrong answer", () => {
    expect(scheduleAfterReview(3, false, "2026-07-17")).toEqual({
      intervalIndex: 0,
      dueDay: "2026-07-18",
    });
  });
});
