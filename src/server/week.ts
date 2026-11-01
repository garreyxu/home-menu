import { isMeal, type Meal } from "@/server/meals";

export const WEEK_TIME_ZONE = "America/Los_Angeles";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export class MenuInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MenuInputError";
  }
}

export function isSundayWeekStart(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));

  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day &&
    utc.getUTCDay() === 0
  );
}

export function assertSundayWeekStart(value: string): string {
  if (!isSundayWeekStart(value)) {
    throw new MenuInputError("Week start must be a Sunday in YYYY-MM-DD form.");
  }
  return value;
}

export function assertDayOfWeek(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 6) {
    throw new MenuInputError(
      "dayOfWeek must be an integer from 0 (Sunday) through 6 (Saturday).",
    );
  }
  return value;
}

export function assertMeal(value: string): Meal {
  if (!isMeal(value)) {
    throw new MenuInputError("meal must be breakfast, lunch, or dinner.");
  }
  return value;
}

export function assertDishId(value: string): string {
  if (value.trim() === "") {
    throw new MenuInputError("dishId must not be empty.");
  }
  return value;
}

/**
 * Sunday of the calendar week that contains `date` in America/Los_Angeles,
 * as a YYYY-MM-DD date. Weekday boundaries follow Pacific Time, including DST.
 */
export function toWeekStart(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new MenuInputError("toWeekStart expected a valid Date.");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: WEEK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;

  const year = Number(part("year"));
  const month = Number(part("month"));
  const day = Number(part("day"));
  const weekday = WEEKDAY_INDEX[part("weekday") ?? ""];

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    weekday === undefined
  ) {
    throw new MenuInputError("Could not resolve the Pacific calendar date.");
  }

  const sunday = new Date(Date.UTC(year, month - 1, day));
  sunday.setUTCDate(sunday.getUTCDate() - weekday);

  const y = sunday.getUTCFullYear();
  const m = String(sunday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(sunday.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
