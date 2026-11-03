import { describe, expect, it } from "vitest";

import { toWeekStart } from "@/server/menu";
import {
  MenuInputError,
  assertDayOfWeek,
  assertMeal,
  assertSundayWeekStart,
  formatWeekRange,
  isSundayWeekStart,
  parseMenuSlot,
  shiftWeek,
} from "@/server/week";

describe("toWeekStart", () => {
  it("keeps a Sunday in Pacific Time", () => {
    expect(toWeekStart(new Date("2026-01-04T20:00:00Z"))).toBe("2026-01-04");
    expect(toWeekStart(new Date("2026-01-04T08:00:00Z"))).toBe("2026-01-04");
  });

  it("walks Monday through Saturday back to Sunday", () => {
    expect(toWeekStart(new Date("2026-01-05T20:00:00Z"))).toBe("2026-01-04");
    expect(toWeekStart(new Date("2026-01-06T20:00:00Z"))).toBe("2026-01-04");
    expect(toWeekStart(new Date("2026-01-07T20:00:00Z"))).toBe("2026-01-04");
    expect(toWeekStart(new Date("2026-01-08T20:00:00Z"))).toBe("2026-01-04");
    expect(toWeekStart(new Date("2026-01-09T20:00:00Z"))).toBe("2026-01-04");
    expect(toWeekStart(new Date("2026-01-10T07:59:00Z"))).toBe("2026-01-04");
  });

  it("uses the Pacific calendar date when UTC is already the next day", () => {
    expect(toWeekStart(new Date("2026-01-04T07:59:00Z"))).toBe("2025-12-28");
    expect(toWeekStart(new Date("2026-01-01T07:59:00Z"))).toBe("2025-12-28");
    expect(toWeekStart(new Date("2025-12-31T08:00:00Z"))).toBe("2025-12-28");
  });

  it("stays on the Pacific Sunday across the spring-forward and fall-back hours", () => {
    expect(toWeekStart(new Date("2026-03-08T09:30:00Z"))).toBe("2026-03-08");
    expect(toWeekStart(new Date("2026-03-08T10:30:00Z"))).toBe("2026-03-08");
    expect(toWeekStart(new Date("2026-11-01T06:59:00Z"))).toBe("2026-10-25");
    expect(toWeekStart(new Date("2026-11-01T07:00:00Z"))).toBe("2026-11-01");
    expect(toWeekStart(new Date("2026-11-01T08:30:00Z"))).toBe("2026-11-01");
    expect(toWeekStart(new Date("2026-11-01T09:30:00Z"))).toBe("2026-11-01");
  });

  it("rejects an invalid date", () => {
    expect(() => toWeekStart(new Date("not-a-date"))).toThrow(MenuInputError);
  });
});

describe("week and meal guards", () => {
  it("accepts a real Sunday and rejects other dates", () => {
    expect(isSundayWeekStart("2026-01-04")).toBe(true);
    expect(isSundayWeekStart("2026-01-05")).toBe(false);
    expect(isSundayWeekStart("2026-02-31")).toBe(false);
    expect(isSundayWeekStart("01-04-2026")).toBe(false);
    expect(assertSundayWeekStart("2026-11-01")).toBe("2026-11-01");
    expect(() => assertSundayWeekStart("2026-11-02")).toThrow(MenuInputError);
  });

  it("accepts days 0 through 6 and the meal names", () => {
    expect(assertDayOfWeek(0)).toBe(0);
    expect(assertDayOfWeek(6)).toBe(6);
    expect(() => assertDayOfWeek(1.5)).toThrow(MenuInputError);
    expect(() => assertDayOfWeek(7)).toThrow(MenuInputError);
    expect(assertMeal("breakfast")).toBe("breakfast");
    expect(assertMeal("lunch")).toBe("lunch");
    expect(assertMeal("dinner")).toBe("dinner");
    expect(() => assertMeal("snack")).toThrow(MenuInputError);
  });
});

describe("week navigation", () => {
  it("shifts by whole Sundays and formats the range", () => {
    expect(isSundayWeekStart("2026-12-27")).toBe(true);
    expect(shiftWeek("2026-01-04", 1)).toBe("2026-01-11");
    expect(shiftWeek("2026-01-04", -1)).toBe("2025-12-28");
    expect(shiftWeek("2026-12-27", 0)).toBe("2026-12-27");
    expect(formatWeekRange("2026-01-04")).toBe("1月4日–1月10日");
    expect(formatWeekRange("2025-12-28")).toBe("12月28日–1月3日");
    expect(() => shiftWeek("2026-01-05", 1)).toThrow(MenuInputError);
  });
});

describe("parseMenuSlot", () => {
  const slot = {
    weekStart: "2026-01-04",
    dayOfWeek: 2,
    meal: "dinner",
    dishId: "sample-dish:番茄炒蛋",
  };

  it("accepts a Sunday slot and trims the dish id", () => {
    expect(
      parseMenuSlot({ ...slot, dishId: "  sample-dish:番茄炒蛋  " }),
    ).toEqual(slot);
  });

  it("rejects dates, days, meals, and ids that are not a slot", () => {
    expect(() => parseMenuSlot(null)).toThrow(MenuInputError);
    expect(() => parseMenuSlot([])).toThrow(MenuInputError);
    expect(() => parseMenuSlot({ ...slot, weekStart: "2026-01-05" })).toThrow(
      MenuInputError,
    );
    expect(() => parseMenuSlot({ ...slot, dayOfWeek: "2" })).toThrow(
      MenuInputError,
    );
    expect(() => parseMenuSlot({ ...slot, dayOfWeek: 7 })).toThrow(
      MenuInputError,
    );
    expect(() => parseMenuSlot({ ...slot, meal: "snack" })).toThrow(
      MenuInputError,
    );
    expect(() => parseMenuSlot({ ...slot, dishId: "   " })).toThrow(
      MenuInputError,
    );
    expect(() => parseMenuSlot({ ...slot, dishId: "x".repeat(201) })).toThrow(
      MenuInputError,
    );
  });
});
