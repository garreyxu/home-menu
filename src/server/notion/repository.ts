import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import type { Database } from "@/server/db";
import { categories, dishes, menuItems } from "@/server/db/schema";
import type {
  DishRepository,
  StoredNotionDish,
  UpsertDish,
} from "@/server/notion/import-catalog";

const CATEGORY_ORDER = [
  "大荤",
  "小荤",
  "素菜",
  "靓汤",
  "主食",
  "早餐",
  "豆制品",
  "酱汁",
  "一锅煮",
  "蛋料理",
  "未分类",
];

export function createDishRepository(db: Database): DishRepository {
  const categoryIds = new Map<string, string>();

  async function ensureCategory(name: string): Promise<string> {
    const cached = categoryIds.get(name);
    if (cached) return cached;

    const [found] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.name, name))
      .limit(1);
    if (found) {
      categoryIds.set(name, found.id);
      return found.id;
    }

    const preferred = CATEGORY_ORDER.indexOf(name);
    let sortOrder = preferred;
    if (preferred < 0) {
      const [maxRow] = await db
        .select({
          value: sql<number>`coalesce(max(${categories.sortOrder}), -1)`,
        })
        .from(categories);
      sortOrder = Number(maxRow?.value ?? -1) + 1;
    }

    const inserted = await db
      .insert(categories)
      .values({ name, sortOrder })
      .onConflictDoNothing({ target: categories.name })
      .returning({ id: categories.id });
    const created = inserted[0];
    if (created) {
      categoryIds.set(name, created.id);
      return created.id;
    }

    const [again] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.name, name))
      .limit(1);
    if (!again) throw new Error("分类没能写入。");
    categoryIds.set(name, again.id);
    return again.id;
  }

  return {
    async listNotionDishes() {
      const rows = await db
        .select({
          id: dishes.id,
          notionPageId: dishes.notionPageId,
          name: dishes.name,
          isActive: dishes.isActive,
        })
        .from(dishes)
        .where(isNotNull(dishes.notionPageId));

      const stored: StoredNotionDish[] = [];
      for (const row of rows) {
        if (!row.notionPageId) continue;
        stored.push({
          id: row.id,
          notionPageId: row.notionPageId,
          name: row.name,
          isActive: row.isActive,
        });
      }
      return stored;
    },

    async upsert(dish: UpsertDish) {
      const categoryId = await ensureCategory(dish.categoryName);
      const values = {
        name: dish.name,
        categoryId,
        description: dish.description,
        cookTime: dish.cookTime,
        ingredients: dish.ingredients,
        rating: dish.rating,
        tried: dish.tried,
        cuisines: dish.cuisines,
        mainIngredient: dish.mainIngredient,
        body: dish.body,
        hasBody: dish.hasBody,
        photoKey: null,
        isActive: true,
        updatedAt: new Date(),
      };
      const inserted = await db
        .insert(dishes)
        .values({ notionPageId: dish.notionPageId, ...values })
        .onConflictDoNothing({ target: dishes.notionPageId })
        .returning({ id: dishes.id });
      if (inserted[0]) return "added";

      await db
        .update(dishes)
        .set(values)
        .where(eq(dishes.notionPageId, dish.notionPageId));
      return "updated";
    },

    async retire(notionPageIds) {
      if (notionPageIds.length === 0) return { deleted: 0, inactivated: 0 };
      const rows = await db
        .select({
          id: dishes.id,
          isActive: dishes.isActive,
        })
        .from(dishes)
        .where(inArray(dishes.notionPageId, [...notionPageIds]));
      if (rows.length === 0) return { deleted: 0, inactivated: 0 };

      const links = await db
        .select({ dishId: menuItems.dishId })
        .from(menuItems)
        .where(
          inArray(
            menuItems.dishId,
            rows.map((row) => row.id),
          ),
        );
      const referenced = new Set(links.map((link) => link.dishId));
      const deleteIds = rows
        .filter((row) => !referenced.has(row.id))
        .map((row) => row.id);
      const inactivateIds = rows
        .filter((row) => referenced.has(row.id) && row.isActive)
        .map((row) => row.id);

      if (deleteIds.length > 0) {
        await db.delete(dishes).where(inArray(dishes.id, deleteIds));
      }
      if (inactivateIds.length > 0) {
        await db
          .update(dishes)
          .set({ isActive: false, photoKey: null, updatedAt: new Date() })
          .where(inArray(dishes.id, inactivateIds));
      }
      return { deleted: deleteIds.length, inactivated: inactivateIds.length };
    },

    async countOnWall() {
      const rows = await db
        .select({ id: dishes.id })
        .from(dishes)
        .where(and(eq(dishes.isActive, true), isNotNull(dishes.notionPageId)));
      return { onWall: rows.length };
    },
  };
}
