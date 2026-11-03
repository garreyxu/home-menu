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

const DISH_ID_MAX_LENGTH = 200;

export function assertDishId(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > DISH_ID_MAX_LENGTH) {
    throw new MenuInputError("dishId is invalid.");
  }
  return trimmed;
}

export type MenuSlotInput = {
  weekStart: string;
  dayOfWeek: number;
  meal: Meal;
  dishId: string;
};

/** Rejects anything that is not a Sunday, a day 0–6, a meal, and a dish id. */
export function parseMenuSlot(input: unknown): MenuSlotInput {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new MenuInputError("Menu slot is missing.");
  }

  const value = input as Record<string, unknown>;
  const weekStart = assertSundayWeekStart(
    typeof value.weekStart === "string" ? value.weekStart : "",
  );
  const dayOfWeek = assertDayOfWeek(
    typeof value.dayOfWeek === "number" ? value.dayOfWeek : Number.NaN,
  );
  const meal = assertMeal(typeof value.meal === "string" ? value.meal : "");
  const dishId = assertDishId(
    typeof value.dishId === "string" ? value.dishId : "",
  );

  return { weekStart, dayOfWeek, meal, dishId };
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function utcDateFromIso(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new MenuInputError("Expected a YYYY-MM-DD date.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new MenuInputError("Expected a real YYYY-MM-DD date.");
  }
  return utc;
}

export function addCalendarDays(isoDate: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new MenuInputError("days must be an integer.");
  }
  const utc = utcDateFromIso(isoDate);
  utc.setUTCDate(utc.getUTCDate() + days);
  return formatUtcDate(utc);
}

/** Move a Sunday week start by whole weeks. The result is also a Sunday. */
export function shiftWeek(weekStart: string, weeks: number): string {
  if (!Number.isInteger(weeks)) {
    throw new MenuInputError("weeks must be an integer.");
  }
  return addCalendarDays(assertSundayWeekStart(weekStart), weeks * 7);
}

export function formatWeekRange(weekStart: string): string {
  const sunday = assertSundayWeekStart(weekStart);
  const saturday = addCalendarDays(sunday, 6);
  const label = (iso: string) => {
    const [, month, day] = iso.split("-");
    return `${Number(month)}月${Number(day)}日`;
  };
  return `${label(sunday)}–${label(saturday)}`;
}

function pacificCalendar(date: Date): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new MenuInputError("Expected a valid Date.");
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

  return { year, month, day, weekday };
}

/** Calendar date in America/Los_Angeles, as YYYY-MM-DD. */
export function pacificDateIso(date: Date): string {
  const { year, month, day } = pacificCalendar(date);
  return formatUtcDate(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * Sunday of the calendar week that contains `date` in America/Los_Angeles,
 * as a YYYY-MM-DD date. Weekday boundaries follow Pacific Time, including DST.
 */
export function toWeekStart(date: Date): string {
  const { year, month, day, weekday } = pacificCalendar(date);
  const sunday = new Date(Date.UTC(year, month - 1, day));
  sunday.setUTCDate(sunday.getUTCDate() - weekday);
  return formatUtcDate(sunday);
}
