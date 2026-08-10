import { describe, expect, it } from "vitest";

import { formatPercent, isoWeekMonday } from "./api";

describe("isoWeekMonday", () => {
  it("returns the same date when input is Monday", () => {
    expect(isoWeekMonday("2026-08-03")).toBe("2026-08-03");
  });

  it("maps Sunday back to the preceding Monday", () => {
    expect(isoWeekMonday("2026-08-09")).toBe("2026-08-03");
  });

  it("rolls across month boundaries", () => {
    expect(isoWeekMonday("2026-08-01")).toBe("2026-07-27");
  });
});

describe("formatPercent", () => {
  it("shows 暂无 for nullish ratios", () => {
    expect(formatPercent(null)).toBe("暂无");
    expect(formatPercent(undefined)).toBe("暂无");
  });

  it("rounds to one decimal place", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(0.755)).toBe("75.5%");
    expect(formatPercent(1)).toBe("100%");
  });
});
