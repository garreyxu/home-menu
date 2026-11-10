import { customNameKey } from "@/lib/custom-name";
import type { WeekMenuItemView } from "@/lib/menu-slots";
import type { Meal } from "@/server/meals";
export function moveDuplicate(
  items: readonly WeekMenuItemView[],
  item: WeekMenuItemView,
  day: number,
  meal: Meal,
) {
  return items.some(
    (i) =>
      i.id !== item.id &&
      i.dayOfWeek === day &&
      i.meal === meal &&
      (item.dishId
        ? i.dishId === item.dishId
        : !i.dishId &&
          customNameKey(i.customName ?? i.dishName) ===
            customNameKey(item.customName ?? item.dishName)),
  );
}
