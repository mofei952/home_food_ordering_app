import { describe, expect, it } from "vitest";

import {
  defaultMealType,
  hourInTimezone,
  shiftLocalDate,
  todayInTimezone,
} from "./api";

describe("shiftLocalDate", () => {
  it("moves across month boundaries", () => {
    expect(shiftLocalDate("2026-08-01", -1)).toBe("2026-07-31");
    expect(shiftLocalDate("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("supports zero delta", () => {
    expect(shiftLocalDate("2026-08-10", 0)).toBe("2026-08-10");
  });
});

describe("defaultMealType", () => {
  it("uses lunch before 15:00 household local time", () => {
    // 2026-08-10 06:00 UTC → 14:00 Asia/Shanghai
    const before = new Date("2026-08-10T06:00:00Z");
    expect(hourInTimezone("Asia/Shanghai", before)).toBe(14);
    expect(defaultMealType("Asia/Shanghai", before)).toBe("lunch");
  });

  it("uses dinner at and after 15:00 household local time", () => {
    // 2026-08-10 07:00 UTC → 15:00 Asia/Shanghai
    const atBoundary = new Date("2026-08-10T07:00:00Z");
    expect(hourInTimezone("Asia/Shanghai", atBoundary)).toBe(15);
    expect(defaultMealType("Asia/Shanghai", atBoundary)).toBe("dinner");
  });
});

describe("todayInTimezone", () => {
  it("rolls calendar date at local midnight", () => {
    // 2026-08-10 16:00 UTC → 2026-08-11 00:00 Asia/Shanghai
    const localMidnight = new Date("2026-08-10T16:00:00Z");
    expect(todayInTimezone("Asia/Shanghai", localMidnight)).toBe("2026-08-11");
  });
});
