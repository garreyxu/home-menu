import { expect, it } from "vitest";
import { formatCookTime } from "@/lib/cook-time";

it.each([
  ["10 min", "10 分钟"],
  ["10 mins", "10 分钟"],
  ["1 hr 20 min", "1 小时 20 分钟"],
  ["1 hour", "1 小时"],
  ["2 hours 5 minutes", "2 小时 5 分钟"],
  [" 10 MIN ", "10 分钟"],
  ["0 min", "0 分钟"],
  ["30 分钟", "30 分钟"],
  ["overnight", "overnight"],
  ["10 min extra", "10 min extra"],
  ["1.5 hr", "1.5 hr"],
  ["", ""],
  ["  unknown  ", "  unknown  "],
])("formats %j as %j", (input, output) => {
  expect(formatCookTime(input)).toBe(output);
});
