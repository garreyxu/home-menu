import type { Meal } from "@/server/meals";

export const DAY_LABELS = [
  "周日",
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
] as const;

export const MEAL_SHORT: Record<Meal, string> = {
  breakfast: "早",
  lunch: "午",
  dinner: "晚",
};

export const MEAL_FULL: Record<Meal, string> = {
  breakfast: "早餐",
  lunch: MEAL_SHORT.lunch,
  dinner: "晚餐",
};

export const MENU_ACTION_ERROR = {
  invalid: "日期或餐次不对。",
  missingDish: "没有这道菜。",
  failed: "没能改菜单，请再试一次。",
} as const;

export type WeekMenuItemView = {
  id: string;
  dayOfWeek: number;
  meal: Meal;
  dishId: string | null;
  customName?: string | null;
  dishName: string;
};

export type WeekMenuView = {
  weekStart: string;
  items: WeekMenuItemView[];
};

export type MenuActionResult =
  | { ok: true; week: WeekMenuView; added: boolean }
  | { ok: false; error: string };

export function slotLabel(dayOfWeek: number, meal: Meal): string {
  return `${DAY_LABELS[dayOfWeek] ?? ""}${MEAL_FULL[meal]}`;
}
