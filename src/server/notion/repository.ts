import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import type { Database } from "@/server/db";
import { categories, dishes, menuItems } from "@/server/db/schema";
import { planCategoryAlignment } from "@/server/notion/category-order";
import type {
  DishRepository,
  StoredNotionDish,
  UpsertDish,
} from "@/server/notion/import-catalog";
import { planSeedRetirement } from "@/server/notion/seed-rows";

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

    // alignCategories rewrites sort_order after the sync. 0 is a placeholder.
    const inserted = await db
      .insert(categories)
      .values({ name, sortOrder: 0 })
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

  async function removalSets(
    database: Database,
    notionPageIds: readonly string[],
  ): Promise<{ deleteIds: string[]; inactivateIds: string[] }> {
    if (notionPageIds.length === 0) {
      return { deleteIds: [], inactivateIds: [] };
    }
    const rows = await database
      .select({
        id: dishes.id,
        isActive: dishes.isActive,
      })
      .from(dishes)
      .where(inArray(dishes.notionPageId, [...notionPageIds]));
    if (rows.length === 0) return { deleteIds: [], inactivateIds: [] };

    const links = await database
      .select({ dishId: menuItems.dishId })
      .from(menuItems)
      .where(
        inArray(
          menuItems.dishId,
          rows.map((row) => row.id),
        ),
      );
    const referenced = new Set(links.map((link) => link.dishId));
    return {
      deleteIds: rows
        .filter((row) => !referenced.has(row.id))
        .map((row) => row.id),
      inactivateIds: rows
        .filter((row) => referenced.has(row.id) && row.isActive)
        .map((row) => row.id),
    };
  }

  return {
    async listNotionDishes() {
      const rows = await db
        .select({
          id: dishes.id,
          notionPageId: dishes.notionPageId,
          name: dishes.name,
          isActive: dishes.isActive,
          hasRecipe: sql<boolean>`${dishes.recipeBlocks} is not null`,
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
          hasRecipe: row.hasRecipe === true,
        });
      }
      return stored;
    },

    async upsert(dish: UpsertDish) {
      const inserted = await db
        .insert(dishes)
        .values(await dishValues(dish, ensureCategory))
        .onConflictDoNothing({ target: dishes.notionPageId })
        .returning({ id: dishes.id });
      if (inserted[0]) return "added";
      await upsertMany(db, [dish], ensureCategory);
      return "updated";
    },

    async upsertMany(items) {
      await upsertMany(db, items, ensureCategory);
    },

    async removalPlan(notionPageIds) {
      const plan = await removalSets(db, notionPageIds);
      return {
        deleted: plan.deleteIds.length,
        inactivated: plan.inactivateIds.length,
      };
    },

    async retire(notionPageIds) {
      const { deleteIds, inactivateIds } = await removalSets(db, notionPageIds);
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

    async retireSeeds() {
      return retireSeedDishes(db);
    },

    async countOnWall() {
      const rows = await db
        .select({ id: dishes.id })
        .from(dishes)
        .where(and(eq(dishes.isActive, true), isNotNull(dishes.notionPageId)));
      return { onWall: rows.length };
    },

    async alignCategories(notionOptionOrder) {
      const existing = await db
        .select({
          id: categories.id,
          name: categories.name,
          sortOrder: categories.sortOrder,
        })
        .from(categories);
      if (existing.length === 0) return;

      const refs = await db
        .select({ categoryId: dishes.categoryId })
        .from(dishes);
      const plan = planCategoryAlignment({
        categories: existing,
        referencedCategoryIds: new Set(refs.map((row) => row.categoryId)),
        notionOptionOrder,
      });

      if (plan.deleteIds.length > 0) {
        await db
          .delete(categories)
          .where(inArray(categories.id, plan.deleteIds));
      }

      const current = new Map(existing.map((row) => [row.id, row.sortOrder]));
      for (const item of plan.sort) {
        if (current.get(item.id) === item.sortOrder) continue;
        await db
          .update(categories)
          .set({ sortOrder: item.sortOrder })
          .where(eq(categories.id, item.id));
      }
    },
  };
}

const UPSERT_CHUNK = 20;

async function dishValues(
  dish: UpsertDish,
  ensureCategory: (name: string) => Promise<string>,
) {
  return {
    notionPageId: dish.notionPageId,
    name: dish.name,
    categoryId: await ensureCategory(dish.categoryName),
    description: dish.description,
    cookTime: dish.cookTime,
    ingredients: dish.ingredients,
    rating: dish.rating,
    tried: dish.tried,
    cuisines: dish.cuisines,
    mainIngredient: dish.mainIngredient,
    body: dish.body,
    recipeBlocks: dish.recipeBlocks,
    hasBody: dish.hasBody,
    photoKey: null,
    isActive: true,
    updatedAt: new Date(),
  };
}

async function upsertMany(
  db: Database,
  items: readonly UpsertDish[],
  ensureCategory: (name: string) => Promise<string>,
): Promise<void> {
  if (items.length === 0) return;
  const rows = [];
  for (const dish of items) rows.push(await dishValues(dish, ensureCategory));
  for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK);
    await db
      .insert(dishes)
      .values(chunk)
      .onConflictDoUpdate({
        target: dishes.notionPageId,
        set: {
          name: sql`excluded.name`,
          categoryId: sql`excluded.category_id`,
          description: sql`excluded.description`,
          cookTime: sql`excluded.cook_time`,
          ingredients: sql`excluded.ingredients`,
          rating: sql`excluded.rating`,
          tried: sql`excluded.tried`,
          cuisines: sql`excluded.cuisines`,
          mainIngredient: sql`excluded.main_ingredient`,
          body: sql`excluded.body`,
          recipeBlocks: sql`excluded.recipe_blocks`,
          hasBody: sql`excluded.has_body`,
          photoKey: sql`excluded.photo_key`,
          isActive: sql`excluded.is_active`,
          updatedAt: sql`now()`,
        },
      });
  }
}

/** Retire sample dishes inside one Neon HTTP transaction. */
export async function retireSeedDishes(db: Database): Promise<number> {
  const seedRows = await db
    .select({
      id: dishes.id,
      name: dishes.name,
      isActive: dishes.isActive,
    })
    .from(dishes)
    .where(isNull(dishes.notionPageId));
  if (seedRows.length === 0) return 0;

  const imported = await db
    .select({
      id: dishes.id,
      name: dishes.name,
      isActive: dishes.isActive,
    })
    .from(dishes)
    .where(isNotNull(dishes.notionPageId));

  const seedIds = seedRows.map((row) => row.id);
  const links =
    seedIds.length === 0
      ? []
      : await db
          .select({ dishId: menuItems.dishId })
          .from(menuItems)
          .where(inArray(menuItems.dishId, seedIds));
  const ops = planSeedRetirement({
    seeds: seedRows,
    imported,
    referencedSeedIds: new Set(links.map((link) => link.dishId)),
  });
  if (ops.length === 0) return 0;

  const sqlClient = db.$client;
  await sqlClient.transaction((txn) =>
    ops.flatMap((op) => {
      if (op.kind === "repoint") {
        return [
          txn`DELETE FROM menu_items AS old USING menu_items AS keep WHERE old.dish_id = ${op.seedId}::uuid AND keep.dish_id = ${op.importedId}::uuid AND keep.weekly_menu_id = old.weekly_menu_id AND keep.day_of_week = old.day_of_week AND keep.meal = old.meal`,
          txn`UPDATE menu_items SET dish_id = ${op.importedId}::uuid WHERE dish_id = ${op.seedId}::uuid`,
          txn`DELETE FROM dishes WHERE id = ${op.seedId}::uuid AND notion_page_id IS NULL`,
        ];
      }
      if (op.kind === "delete") {
        return [
          txn`DELETE FROM dishes WHERE id = ${op.seedId}::uuid AND notion_page_id IS NULL`,
        ];
      }
      return [
        txn`UPDATE dishes SET is_active = false, updated_at = now() WHERE id = ${op.seedId}::uuid AND notion_page_id IS NULL AND is_active = true`,
      ];
    }),
  );
  return ops.length;
}
