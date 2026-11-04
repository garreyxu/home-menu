const SEASONS = [
  { name: "春", months: [3, 4, 5] },
  { name: "夏", months: [6, 7, 8] },
  { name: "秋", months: [9, 10, 11] },
  { name: "冬", months: [12, 1, 2] },
] as const;

/** Vertical header note, for example 「秋季推荐」. Decorative; not the page title. */
export function seasonRecommendation(
  date: Date,
  timeZone = "America/Los_Angeles",
): string {
  const month = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "numeric",
    }).format(date),
  );
  const season = SEASONS.find((entry) =>
    (entry.months as readonly number[]).includes(month),
  );
  return `${season?.name ?? "秋"}季推荐`;
}
