import { describe, expect, it } from "vitest";
import { addDays, dayString, isValidTimezone } from "../src/game/time";

describe("dayString", () => {
  const instant = new Date("2026-07-17T23:30:00Z");

  it("uses the user's timezone, not UTC", () => {
    expect(dayString(instant, "UTC")).toBe("2026-07-17");
    expect(dayString(instant, "Asia/Tokyo")).toBe("2026-07-18"); // UTC+9
    expect(dayString(instant, "America/Los_Angeles")).toBe("2026-07-17"); // UTC-7 in July
  });

  it("handles the day boundary the other direction", () => {
    const earlyUtc = new Date("2026-07-17T02:00:00Z");
    expect(dayString(earlyUtc, "America/Los_Angeles")).toBe("2026-07-16");
  });
});

describe("addDays", () => {
  it("adds within a month", () => {
    expect(addDays("2026-07-17", 1)).toBe("2026-07-18");
  });

  it("rolls over month and year boundaries", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // leap year
  });

  it("subtracts with negative n", () => {
    expect(addDays("2026-08-01", -1)).toBe("2026-07-31");
  });

  it("rejects malformed input", () => {
    expect(() => addDays("not-a-day", 1)).toThrow();
  });
});

describe("isValidTimezone", () => {
  it("accepts IANA names and rejects junk", () => {
    expect(isValidTimezone("Africa/Lagos")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("Mars/Olympus_Mons")).toBe(false);
  });
});
