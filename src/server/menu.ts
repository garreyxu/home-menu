import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/server/db";
import { categories, dishes, menuItems, weeklyMenus } from "@/server/db/schema";
import {
  groupCategoriesWithDishes,
  orderMenuItems,
  type CategoryWithDishes,
  type MenuItemRecord,
  type WeekMenu,
  type WeekMenuItem,
} from "@/server/menu-view";
import type { Meal } from "@/server/meals";
import {
  assertDayOfWeek,
  assertDishId,
  assertMeal,
  assertSundayWeekStart,
  toWeekStart,
} from "@/server/week";

export { toWeekStart };
export type {
  CategoryWithDishes,
  Meal,
  MenuItemRecord,
  WeekMenu,
  WeekMenuItem,
};

export async function listCategoriesWithDishes(): Promise<
  CategoryWithDishes[]
> {
  const rows = await getDb()
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      sortOrder: categories.sortOrder,
      dishId: dishes.id,
      notionPageId: dishes.notionPageId,
      dishName: dishes.name,
      description: dishes.description,
      photoKey: dishes.photoKey,
      isActive: dishes.isActive,
    })
    .from(categories)
    .leftJoin(dishes, eq(dishes.categoryId, categories.id))
    .orderBy(asc(categories.sortOrder), asc(categories.name), asc(dishes.name));

  return groupCategoriesWithDishes(rows);
}

export async function getOrCreateWeek(weekStart: string) {
  const sunday = assertSundayWeekStart(weekStart);
  const db = getDb();

  const inserted = await db
    .insert(weeklyMenus)
    .values({ weekStart: sunday })
    .onConflictDoNothing({ target: weeklyMenus.weekStart })
    .returning();

  if (inserted[0]) return inserted[0];

  const [existing] = await db
    .select()
    .from(weeklyMenus)
    .where(eq(weeklyMenus.weekStart, sunday))
    .limit(1);

  if (!existing) {
    throw new Error("Could not load the weekly menu after insert.");
  }

  return existing;
}

export async function addMenuItem(input: {
  weekStart: string;
  dayOfWeek: number;
  meal: string;
  dishId: string;
}): Promise<{ item: MenuItemRecord; created: boolean }> {
  const dayOfWeek = assertDayOfWeek(input.dayOfWeek);
  const meal = assertMeal(input.meal);
  const dishId = assertDishId(input.dishId);
  const week = await getOrCreateWeek(input.weekStart);
  const db = getDb();

  const inserted = await db
    .insert(menuItems)
    .values({
      weeklyMenuId: week.id,
      dayOfWeek,
      meal,
      dishId,
    })
    .onConflictDoNothing({
      target: [
        menuItems.weeklyMenuId,
        menuItems.dayOfWeek,
        menuItems.meal,
        menuItems.dishId,
      ],
    })
    .returning();

  if (inserted[0]) {
    return { item: toMenuItem(inserted[0]), created: true };
  }

  const [existing] = await db
    .select()
    .from(menuItems)
    .where(
      and(
        eq(menuItems.weeklyMenuId, week.id),
        eq(menuItems.dayOfWeek, dayOfWeek),
        eq(menuItems.meal, meal),
        eq(menuItems.dishId, dishId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("Could not load the menu item after insert.");
  }

  return { item: toMenuItem(existing), created: false };
}

export async function removeMenuItem(input: {
  weekStart: string;
  dayOfWeek: number;
  meal: string;
  dishId: string;
}): Promise<{ removed: boolean }> {
  const sunday = assertSundayWeekStart(input.weekStart);
  const dayOfWeek = assertDayOfWeek(input.dayOfWeek);
  const meal = assertMeal(input.meal);
  const dishId = assertDishId(input.dishId);
  const db = getDb();

  const [week] = await db
    .select({ id: weeklyMenus.id })
    .from(weeklyMenus)
    .where(eq(weeklyMenus.weekStart, sunday))
    .limit(1);

  if (!week) return { removed: false };

  const deleted = await db
    .delete(menuItems)
    .where(
      and(
        eq(menuItems.weeklyMenuId, week.id),
        eq(menuItems.dayOfWeek, dayOfWeek),
        eq(menuItems.meal, meal),
        eq(menuItems.dishId, dishId),
      ),
    )
    .returning({ id: menuItems.id });

  return { removed: deleted.length > 0 };
}

export async function getWeek(weekStart: string): Promise<WeekMenu | null> {
  const sunday = assertSundayWeekStart(weekStart);
  const db = getDb();

  const [week] = await db
    .select()
    .from(weeklyMenus)
    .where(eq(weeklyMenus.weekStart, sunday))
    .limit(1);

  if (!week) return null;

  const rows = await db
    .select({
      id: menuItems.id,
      weeklyMenuId: menuItems.weeklyMenuId,
      dayOfWeek: menuItems.dayOfWeek,
      meal: menuItems.meal,
      dishId: menuItems.dishId,
      dishName: dishes.name,
      createdAt: menuItems.createdAt,
    })
    .from(menuItems)
    .innerJoin(dishes, eq(menuItems.dishId, dishes.id))
    .where(eq(menuItems.weeklyMenuId, week.id));

  return {
    id: week.id,
    weekStart: week.weekStart,
    createdAt: week.createdAt,
    items: orderMenuItems(rows),
  };
}

function toMenuItem(row: {
  id: string;
  weeklyMenuId: string;
  dayOfWeek: number;
  meal: Meal;
  dishId: string;
  createdAt: Date;
}): MenuItemRecord {
  return {
    id: row.id,
    weeklyMenuId: row.weeklyMenuId,
    dayOfWeek: row.dayOfWeek,
    meal: row.meal,
    dishId: row.dishId,
    createdAt: row.createdAt,
  };
}
