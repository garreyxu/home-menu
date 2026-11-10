import { expect, it } from "vitest";
import { slotLabel } from "@/lib/menu-slots";

it.each([
  ["breakfast", "早餐"],
  ["lunch", "午餐"],
  ["dinner", "晚餐"],
] as const)("uses the shared %s label in move announcements", (meal, label) => {
  expect(`已移到${slotLabel(2, meal)}`).toBe(`已移到周二${label}`);
});
