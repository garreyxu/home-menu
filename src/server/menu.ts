import "server-only";

import { and, asc, eq, isNull, or } from "drizzle-orm";

import { getDb } from "@/server/db";
import { categories, dishes, menuItems, weeklyMenus } from "@/server/db/schema";
import { DishNotFoundError } from "@/server/menu-errors";
import { sampleDishCatalog } from "@/server/sample-catalog";
import {
  groupActiveDishesByCategory,
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
      tried: dishes.tried,
      hasBody: dishes.hasBody,
    })
    .from(categories)
    .leftJoin(dishes, eq(dishes.categoryId, categories.id))
    .orderBy(asc(categories.sortOrder), asc(categories.name), asc(dishes.name));

  return groupCategoriesWithDishes(rows);
}

/**
 * Categories by sort_order, each with active dishes that belong on the wall.
 * Notion dishes with an empty page body are stored but hidden.
 * Off Vercel, a missing DATABASE_URL uses the committed sample catalog so
 * local dev and CI can render without Neon. On Vercel it fails closed.
 */
export async function listDishesByCategory(): Promise<CategoryWithDishes[]> {
  if (!process.env.DATABASE_URL?.trim()) {
    if (process.env.VERCEL_ENV?.trim()) {
      console.error("[db] DATABASE_URL is not set.");
      throw new Error("DATABASE_URL is not set.");
    }
    return sampleDishCatalog();
  }

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
      tried: dishes.tried,
      hasBody: dishes.hasBody,
    })
    .from(categories)
    .leftJoin(
      dishes,
      and(
        eq(dishes.categoryId, categories.id),
        eq(dishes.isActive, true),
        or(isNull(dishes.notionPageId), eq(dishes.hasBody, true)),
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.name), asc(dishes.name));

  return groupActiveDishesByCategory(rows);
}

type EphemeralItem = WeekMenuItem;

type EphemeralWeek = {
  id: string;
  weekStart: string;
  createdAt: Date;
  items: EphemeralItem[];
};

const EPHEMERAL_MENU_KEY = "__homeMenuEphemeralWeeks";

function ephemeralWeeks(): Map<string, EphemeralWeek> {
  const scope = globalThis as typeof globalThis & {
    [EPHEMERAL_MENU_KEY]?: Map<string, EphemeralWeek>;
  };
  if (!scope[EPHEMERAL_MENU_KEY]) {
    scope[EPHEMERAL_MENU_KEY] = new Map();
  }
  return scope[EPHEMERAL_MENU_KEY];
}

/**
 * Local dev and CI have no Neon database. The weekly menu then lives in
 * this process so a reload during `next dev` still shows the same slots.
 * Vercel without DATABASE_URL fails closed, matching listDishesByCategory.
 */
function usesEphemeralMenu(): boolean {
  if (process.env.DATABASE_URL?.trim()) return false;
  if (process.env.VERCEL_ENV?.trim()) {
    console.error("[db] DATABASE_URL is not set.");
    throw new Error("DATABASE_URL is not set.");
  }
  return true;
}

/** Test helper for the no-database menu. Does not touch Neon. */
export function clearEphemeralWeeklyMenu(): void {
  ephemeralWeeks().clear();
}

function isForeignKeyError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === "23503") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

export async function findDish(
  dishId: string,
): Promise<{ id: string; name: string } | null> {
  const id = assertDishId(dishId);
  if (usesEphemeralMenu()) {
    for (const category of sampleDishCatalog()) {
      const dish = category.dishes.find((item) => item.id === id);
      if (dish) return { id: dish.id, name: dish.name };
    }
    return null;
  }

  const [row] = await getDb()
    .select({ id: dishes.id, name: dishes.name })
    .from(dishes)
    .where(eq(dishes.id, id))
    .limit(1);
  return row ?? null;
}

async function requireDish(
  dishId: string,
): Promise<{ id: string; name: string }> {
  const dish = await findDish(dishId);
  if (!dish) throw new DishNotFoundError();
  return dish;
}

function ephemeralGetOrCreate(sunday: string): EphemeralWeek {
  const store = ephemeralWeeks();
  const existing = store.get(sunday);
  if (existing) return existing;
  const created: EphemeralWeek = {
    id: crypto.randomUUID(),
    weekStart: sunday,
    createdAt: new Date(),
    items: [],
  };
  store.set(sunday, created);
  return created;
}

function toStoredItem(item: EphemeralItem): EphemeralItem {
  return { ...item, createdAt: new Date(item.createdAt) };
}

export async function getOrCreateWeek(weekStart: string) {
  const sunday = assertSundayWeekStart(weekStart);
  if (usesEphemeralMenu()) {
    const week = ephemeralGetOrCreate(sunday);
    return {
      id: week.id,
      weekStart: week.weekStart,
      createdAt: week.createdAt,
    };
  }

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
  const dish = await requireDish(dishId);

  if (usesEphemeralMenu()) {
    const week = ephemeralGetOrCreate(assertSundayWeekStart(input.weekStart));
    const existing = week.items.find(
      (item) =>
        item.dayOfWeek === dayOfWeek &&
        item.meal === meal &&
        item.dishId === dish.id,
    );
    if (existing) return { item: toStoredItem(existing), created: false };

    const item: EphemeralItem = {
      id: crypto.randomUUID(),
      weeklyMenuId: week.id,
      dayOfWeek,
      meal,
      dishId: dish.id,
      dishName: dish.name,
      createdAt: new Date(),
    };
    week.items.push(item);
    return { item: toStoredItem(item), created: true };
  }

  const week = await getOrCreateWeek(input.weekStart);
  const db = getDb();

  let inserted: (typeof menuItems.$inferSelect)[];
  try {
    inserted = await db
      .insert(menuItems)
      .values({
        weeklyMenuId: week.id,
        dayOfWeek,
        meal,
        dishId: dish.id,
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
  } catch (error) {
    if (isForeignKeyError(error)) throw new DishNotFoundError();
    throw error;
  }

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
  await requireDish(dishId);

  if (usesEphemeralMenu()) {
    const week = ephemeralWeeks().get(sunday);
    if (!week) return { removed: false };
    const before = week.items.length;
    week.items = week.items.filter(
      (item) =>
        !(
          item.dayOfWeek === dayOfWeek &&
          item.meal === meal &&
          item.dishId === dishId
        ),
    );
    return { removed: week.items.length < before };
  }

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
  if (usesEphemeralMenu()) {
    const week = ephemeralWeeks().get(sunday);
    if (!week) return null;
    return {
      id: week.id,
      weekStart: week.weekStart,
      createdAt: week.createdAt,
      items: orderMenuItems(week.items).map(toStoredItem),
    };
  }

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
