/** Format recognized Notion durations for display without changing stored data. */
export function formatCookTime(value: string): string {
  const match =
    /^(?:(\d+)\s*(?:hours?|hrs?)\s*)?(?:(\d+)\s*(?:minutes?|mins?))?$/i.exec(
      value.trim(),
    );
  if (!match || (!match[1] && !match[2])) return value;
  return [match[1] && `${match[1]} 小时`, match[2] && `${match[2]} 分钟`]
    .filter(Boolean)
    .join(" ");
}
