import type { Meal } from "@/server/meals";

export type DishSummary = {
  id: string;
  notionPageId: string | null;
  name: string;
  description: string | null;
  photoKey: string | null;
  isActive: boolean;
  tried: boolean;
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
  tried: boolean | null;
  hasBody: boolean | null;
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
      tried: row.tried === true,
    });
  }

  return categories;
}

export type DishWallCategory = {
  id: string;
  name: string;
  sortOrder: number;
  dishCount: number;
};

export type DishWallDish = {
  id: string;
  name: string;
  categoryName: string;
  description: string | null;
  photoKey: string | null;
  tried: boolean;
};

export type DishWall = {
  categories: DishWallCategory[];
  dishes: DishWallDish[];
  selectedCategory: string | null;
  unknownCategory: boolean;
};

function showsOnWall(row: CategoryDishJoinRow): boolean {
  return row.dishId !== null && row.dishName !== null && row.isActive === true;
}

function blankDish(row: CategoryDishJoinRow): CategoryDishJoinRow {
  return {
    ...row,
    dishId: null,
    notionPageId: null,
    dishName: null,
    description: null,
    photoKey: null,
    isActive: null,
    tried: null,
    hasBody: null,
  };
}

function compareZh(a: string, b: string): number {
  return a.localeCompare(b, "zh-CN");
}

/**
 * Active dishes on the wall. Sample dishes have no Notion id and stay visible.
 * A Notion dish that lost its steps, or was deleted in Notion, is inactive
 * when a weekly menu still references it, and is omitted here.
 * Categories stay even when every dish is hidden.
 * Categories are ordered by sort_order, then name. Dishes are ordered by name.
 */
export function groupActiveDishesByCategory(
  rows: readonly CategoryDishJoinRow[],
): CategoryWithDishes[] {
  const visible = rows.map((row) => {
    if (!showsOnWall(row)) return blankDish(row);
    return row;
  });

  const grouped = groupCategoriesWithDishes(visible).map((category) => {
    const seen = new Set<string>();
    return {
      ...category,
      dishes: category.dishes
        .filter((dish) => {
          if (!dish.isActive || seen.has(dish.id)) return false;
          seen.add(dish.id);
          return true;
        })
        .sort((a, b) => compareZh(a.name, b.name) || a.id.localeCompare(b.id)),
    };
  });

  grouped.sort(
    (a, b) => a.sortOrder - b.sortOrder || compareZh(a.name, b.name),
  );
  return grouped;
}

export function buildDishWall(
  categories: readonly CategoryWithDishes[],
  categoryParam: string | null | undefined,
): DishWall {
  const selected = categoryParam?.trim() ?? "";
  const nav = categories.map((category) => ({
    id: category.id,
    name: category.name,
    sortOrder: category.sortOrder,
    dishCount: category.dishes.length,
  }));

  const toDish =
    (category: CategoryWithDishes) =>
    (dish: DishSummary): DishWallDish => ({
      id: dish.id,
      name: dish.name,
      categoryName: category.name,
      description: dish.description,
      photoKey: dish.photoKey,
      tried: dish.tried,
    });

  if (!selected) {
    return {
      categories: nav,
      dishes: categories.flatMap((category) =>
        category.dishes.map(toDish(category)),
      ),
      selectedCategory: null,
      unknownCategory: false,
    };
  }

  const match = categories.find((category) => category.name === selected);
  if (!match) {
    return {
      categories: nav,
      dishes: [],
      selectedCategory: selected,
      unknownCategory: true,
    };
  }

  return {
    categories: nav,
    dishes: match.dishes.map(toDish(match)),
    selectedCategory: match.name,
    unknownCategory: false,
  };
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
