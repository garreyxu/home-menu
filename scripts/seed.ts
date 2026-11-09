import { neon } from "@neondatabase/serverless";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import { seedDecision } from "../src/server/db/seed-policy";
import { categories, dishes } from "../src/server/db/schema";
import { seedCategories, seedDishes } from "../src/server/db/seed-data";
import { appDatabaseUrl, loadLocalEnv } from "./db-env";
import { redactSecrets } from "./redact";

loadLocalEnv();

async function seed(): Promise<void> {
  if (
    seedDecision({
      vercelEnv: process.env.VERCEL_ENV,
      hasNotionDishes: false,
    }) === "refuse-production"
  ) {
    console.error("[db] Refusing to seed: VERCEL_ENV is production.");
    process.exit(1);
  }

  const url = appDatabaseUrl();
  if (!url) {
    console.error(
      "[db] Cannot seed: set DATABASE_URL or DATABASE_URL_UNPOOLED.",
    );
    process.exit(1);
  }

  const db = drizzle({ client: neon(url), schema: { categories, dishes } });
  const [imported] = await db
    .select({ id: dishes.id })
    .from(dishes)
    .where(isNotNull(dishes.notionPageId))
    .limit(1);
  if (
    seedDecision({
      vercelEnv: process.env.VERCEL_ENV,
      hasNotionDishes: Boolean(imported),
    }) === "skip-imported"
  ) {
    console.log("[db] Skipping seed: this database already has Notion dishes.");
    return;
  }
  console.log("[db] Seeding database.");

  const insertedCategories = await db
    .insert(categories)
    .values(
      seedCategories.map((category) => ({
        name: category.name,
        sortOrder: category.sortOrder,
      })),
    )
    .onConflictDoNothing({ target: categories.name })
    .returning({ name: categories.name });

  const categoryRows = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(
      inArray(
        categories.name,
        seedCategories.map((category) => category.name),
      ),
    );

  const categoryIdByName = new Map(
    categoryRows.map((row) => [row.name, row.id]),
  );
  const categoryId = (name: string) => {
    const id = categoryIdByName.get(name);
    if (!id) throw new Error(`Seed category is missing: ${name}`);
    return id;
  };

  const existingDishes = await db
    .select({ name: dishes.name })
    .from(dishes)
    .where(
      inArray(
        dishes.name,
        seedDishes.map((dish) => dish.name),
      ),
    );
  const existingNames = new Set(existingDishes.map((row) => row.name));
  const missingDishes = seedDishes.filter(
    (dish) => !existingNames.has(dish.name),
  );

  if (missingDishes.length > 0) {
    await db.insert(dishes).values(
      missingDishes.map((dish) => ({
        name: dish.name,
        categoryId: categoryId(dish.categoryName),
        description: dish.description,
        recipeBlocks: dish.recipeBlocks ?? null,
        isActive: true,
      })),
    );
  }

  for (const dish of seedDishes) {
    if (!dish.recipeBlocks) continue;
    await db
      .update(dishes)
      .set({ recipeBlocks: dish.recipeBlocks })
      .where(and(eq(dishes.name, dish.name), isNull(dishes.notionPageId)));
  }

  console.log(
    `[db] Seed complete. categories inserted: ${insertedCategories.length}, already present: ${seedCategories.length - insertedCategories.length}, dishes inserted: ${missingDishes.length}, already present: ${seedDishes.length - missingDishes.length}.`,
  );
}

seed().catch((error: unknown) => {
  const text =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(redactSecrets(text));
  process.exit(1);
});
