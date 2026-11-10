import { describe, expect, it } from "vitest";
import {
  assertE2ECategory,
  assertE2EDish,
  assertE2EWeek,
  assertRunId,
  candidateWeeks,
  e2eEnabled,
  E2E_WEEK_COUNT,
  FIRST_E2E_WEEK,
} from "@/lib/e2e-guard";
import { isSundayWeekStart, shiftWeek } from "@/server/week";

describe("test data environment gate", () => {
  it.each(["seed", "cleanup", "leftovers"])(
    "disables %s in production and unknown environments",
    () => {
      for (const VERCEL_ENV of [
        "production",
        "development",
        "",
        "unknown",
        " preview ",
      ]) {
        for (const NODE_ENV of ["development", "test", "production", undefined])
          expect(e2eEnabled({ VERCEL_ENV, NODE_ENV })).toBe(false);
      }
      for (const NODE_ENV of ["production", "", "unknown", undefined])
        expect(e2eEnabled({ NODE_ENV })).toBe(false);
    },
  );
  it("enables only preview or recognized local test/development", () => {
    expect(e2eEnabled({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(
      true,
    );
    expect(e2eEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(e2eEnabled({ NODE_ENV: "test" })).toBe(true);
  });
});
it("rejects invalid run identifiers and foreign dish/category selectors", () => {
  for (const id of [null, "abc", "UPPER", "run_1234", "a".repeat(41)])
    expect(() => assertRunId(id)).toThrow();
  assertRunId("12345678-2");
  assertE2EDish("run-1234", "e2e:run-1234:1");
  assertE2ECategory("run-1234", "e2e-run-1234");
  for (const id of [
    "real-id",
    "e2e:run-12345:1",
    "e2e:run-1234:0",
    "e2e:run-1234:1:extra",
  ])
    expect(() => assertE2EDish("run-1234", id)).toThrow();
  expect(() => assertE2ECategory("run-1234", "家常菜")).toThrow();
  expect(() => assertE2ECategory("run-1234", "e2e-other-run")).toThrow();
});
it("supports all 522 Sundays, rejects outside dates and non-Sundays", () => {
  for (let i = 0; i < E2E_WEEK_COUNT; i++) {
    const week = shiftWeek(FIRST_E2E_WEEK, i);
    expect(isSundayWeekStart(week)).toBe(true);
    assertE2EWeek(week);
  }
  for (const week of ["2089-12-25", "2100-01-03", "2090-01-02", "2090-02-30"])
    expect(() => assertE2EWeek(week)).toThrow();
  for (let attempt = 0; attempt < 5; attempt++)
    candidateWeeks("run-1234", "spec-label", attempt, 2).forEach(assertE2EWeek);
  expect(candidateWeeks("run-1234", "spec-label", 0, 2)).not.toEqual(
    candidateWeeks("run-1234", "spec-label", 1, 2),
  );
});
