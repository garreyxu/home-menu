import { neon } from "@neondatabase/serverless";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import { categories, dishes } from "../src/server/db/schema";
import { seedCategories, seedDishes } from "../src/server/db/seed-data";
import { appDatabaseUrl, loadLocalEnv } from "./db-env";
import { redactSecrets } from "./redact";

loadLocalEnv();

async function seed(): Promise<void> {
  if (process.env.VERCEL_ENV === "production") {
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
        isActive: true,
      })),
    );
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
