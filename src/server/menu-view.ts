import type { Meal } from "@/server/meals";

export type DishSummary = {
  id: string;
  notionPageId: string | null;
  name: string;
  description: string | null;
  photoKey: string | null;
  isActive: boolean;
};

export type CategoryWithDishes = {
  id: string;
  name: string;
  sortOrder: number;
  dishes: DishSummary[];
};

export type CategoryDishJoinRow = {
  categoryId: string;
  categoryName: string;
  sortOrder: number;
  dishId: string | null;
  notionPageId: string | null;
  dishName: string | null;
  description: string | null;
  photoKey: string | null;
  isActive: boolean | null;
};

export type MenuItemRecord = {
  id: string;
  weeklyMenuId: string;
  dayOfWeek: number;
  meal: Meal;
  dishId: string;
  createdAt: Date;
};

export type WeekMenuItem = MenuItemRecord & {
  dishName: string;
};

export type WeekMenu = {
  id: string;
  weekStart: string;
  createdAt: Date;
  items: WeekMenuItem[];
};

const MEAL_RANK: Record<Meal, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
};

export function groupCategoriesWithDishes(
  rows: readonly CategoryDishJoinRow[],
): CategoryWithDishes[] {
  const categories: CategoryWithDishes[] = [];
  const byId = new Map<string, CategoryWithDishes>();

  for (const row of rows) {
    let category = byId.get(row.categoryId);
    if (!category) {
      category = {
        id: row.categoryId,
        name: row.categoryName,
        sortOrder: row.sortOrder,
        dishes: [],
      };
      byId.set(row.categoryId, category);
      categories.push(category);
    }

    if (row.dishId === null || row.dishName === null || row.isActive === null) {
      continue;
    }

    category.dishes.push({
      id: row.dishId,
      notionPageId: row.notionPageId,
      name: row.dishName,
      description: row.description,
      photoKey: row.photoKey,
      isActive: row.isActive,
    });
  }

  return categories;
}

export function orderMenuItems<
  T extends { id: string; dayOfWeek: number; meal: Meal; createdAt: Date },
>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    const mealDelta = MEAL_RANK[a.meal] - MEAL_RANK[b.meal];
    if (mealDelta !== 0) return mealDelta;
    const timeDelta = a.createdAt.getTime() - b.createdAt.getTime();
    if (timeDelta !== 0) return timeDelta;
    return a.id.localeCompare(b.id);
  });
}
