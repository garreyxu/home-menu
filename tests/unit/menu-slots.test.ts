import { expect, it } from "vitest";
import {
  DAY_LABELS,
  emptySlotLabel,
  MEAL_FULL,
  slotLabel,
} from "@/lib/menu-slots";

it.each([
  ["breakfast", "早餐"],
  ["lunch", "午餐"],
  ["dinner", "晚餐"],
] as const)("uses the shared %s label in move announcements", (meal, label) => {
  expect(`已移到${slotLabel(2, meal)}`).toBe(`已移到周二${label}`);
});

it.each(DAY_LABELS.map((day, index) => [day, index] as const))(
  "names every empty meal on %s using full labels",
  (day, index) => {
    for (const meal of ["breakfast", "lunch", "dinner"] as const) {
      expect(emptySlotLabel(index, meal, true)).toBe(
        `${day}${MEAL_FULL[meal]}，还没点菜，点按加菜`,
      );
      expect(emptySlotLabel(index, meal, false)).toBe(
        `${day}${MEAL_FULL[meal]}，还没点菜`,
      );
    }
  },
);
