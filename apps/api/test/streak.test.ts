import { describe, expect, it } from "vitest";
import { recordActivity } from "../src/game/streak";

const fresh = { current: 0, best: 0, lastActiveDay: null };

describe("recordActivity", () => {
  it("starts a streak on first activity", () => {
    expect(recordActivity(fresh, "2026-07-17")).toEqual({
      current: 1,
      best: 1,
      lastActiveDay: "2026-07-17",
    });
  });

  it("is idempotent within the same day", () => {
    const s = recordActivity(fresh, "2026-07-17");
    expect(recordActivity(s, "2026-07-17")).toEqual(s);
  });

  it("extends on consecutive days, across month boundaries", () => {
    let s = recordActivity(fresh, "2026-07-31");
    s = recordActivity(s, "2026-08-01");
    expect(s.current).toBe(2);
    expect(s.best).toBe(2);
  });

  it("resets to 1 after a missed day but keeps best", () => {
    const s = recordActivity(
      { current: 5, best: 7, lastActiveDay: "2026-07-15" },
      "2026-07-17", // skipped the 16th
    );
    expect(s).toEqual({ current: 1, best: 7, lastActiveDay: "2026-07-17" });
  });

  it("updates best when current surpasses it", () => {
    const s = recordActivity({ current: 7, best: 7, lastActiveDay: "2026-07-16" }, "2026-07-17");
    expect(s.best).toBe(8);
  });
});
