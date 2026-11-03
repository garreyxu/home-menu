import "server-only";

import { requireSession } from "@/lib/auth/require-session";
import type { WeekMenuView } from "@/lib/menu-slots";
import { getWeek } from "@/server/menu";
import type { WeekMenu } from "@/server/menu-view";
import { isSundayWeekStart, toWeekStart } from "@/server/week";

export function toWeekMenuView(
  week: WeekMenu | null,
  weekStart: string,
): WeekMenuView {
  return {
    weekStart,
    items: (week?.items ?? []).map((item) => ({
      id: item.id,
      dayOfWeek: item.dayOfWeek,
      meal: item.meal,
      dishId: item.dishId,
      dishName: item.dishName,
    })),
  };
}

/**
 * The Sunday being shown. A missing or invalid `week` query falls back to
 * the current week in America/Los_Angeles. Callers still pass the original
 * query through links only when it was a real Sunday.
 */
export function resolveWeekStart(weekParam: string | null): string {
  if (weekParam && isSundayWeekStart(weekParam)) return weekParam;
  return toWeekStart(new Date());
}

export async function loadWeekMenu(
  weekParam: string | null,
): Promise<WeekMenuView> {
  await requireSession();
  const weekStart = resolveWeekStart(weekParam);
  const week = await getWeek(weekStart);
  return toWeekMenuView(week, weekStart);
}
