import { HOUR_UNIT, MINUTE_UNIT } from "@/lib/time-units";

const duration = new RegExp(
  String.raw`^(?:(\d+)\s*${HOUR_UNIT}\s*)?(?:(\d+)\s*${MINUTE_UNIT})?$`,
  "i",
);

/** Format recognized Notion durations for display without changing stored data. */
export function formatCookTime(value: string): string {
  const match = duration.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return value;
  return [match[1] && `${match[1]} 小时`, match[2] && `${match[2]} 分钟`]
    .filter(Boolean)
    .join(" ");
}
