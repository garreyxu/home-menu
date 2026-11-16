import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { parseRecipeBlocks, type RecipeBlock } from "@/lib/recipe-blocks";
import { getDb } from "@/server/db";
import { drinks } from "@/server/db/schema";
import { decodeStoredPhoto } from "@/server/notion/drink-photo";

export type DrinkCard = {
  id: string;
  name: string;
  baseSpirits: string[];
  flavors: string[];
  tried: boolean;
  hasPhoto: boolean;
};

export type DrinkDetail = DrinkCard & {
  ingredients: string | null;
  sourceUrl: string | null;
  blocks: RecipeBlock[];
};

export type EphemeralDrink = DrinkDetail & {
  notionPageId: string;
  photo: string | null;
  photoType: string | null;
  isActive: boolean;
  createdAt: Date;
};

const EPHEMERAL_KEY = "__homeMenuEphemeralDrinks";

export function ephemeralDrinks(): Map<string, EphemeralDrink> {
  const scope = globalThis as typeof globalThis & {
    [EPHEMERAL_KEY]?: Map<string, EphemeralDrink>;
  };
  return (scope[EPHEMERAL_KEY] ??= new Map());
}

function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function assertDatabaseAvailable(): void {
  if (databaseConfigured()) return;
  if (process.env.VERCEL_ENV?.trim()) {
    console.error("[db] DATABASE_URL is not set.");
    throw new Error("DATABASE_URL is not set.");
  }
}

export async function listActiveDrinks(): Promise<DrinkCard[]> {
  assertDatabaseAvailable();
  if (!databaseConfigured()) {
    return [...ephemeralDrinks().values()]
      .filter((drink) => drink.isActive)
      .sort((a, b) => a.name.localeCompare(b.name, "zh"))
      .map(toCard);
  }

  const rows = await getDb()
    .select({
      id: drinks.id,
      name: drinks.name,
      baseSpirits: drinks.baseSpirits,
      flavors: drinks.flavors,
      tried: drinks.tried,
      hasPhoto: sql<boolean>`${drinks.photo} is not null and ${drinks.photo} <> ''`,
    })
    .from(drinks)
    .where(eq(drinks.isActive, true))
    .orderBy(asc(drinks.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    baseSpirits: stringList(row.baseSpirits),
    flavors: stringList(row.flavors),
    tried: row.tried,
    hasPhoto: flag(row.hasPhoto),
  }));
}

export async function getActiveDrink(id: string): Promise<DrinkDetail | null> {
  if (!isUuid(id)) return null;
  assertDatabaseAvailable();
  if (!databaseConfigured()) {
    const drink = [...ephemeralDrinks().values()].find(
      (row) => row.id === id && row.isActive,
    );
    return drink ? toDetail(drink) : null;
  }

  const [row] = await getDb()
    .select({
      id: drinks.id,
      name: drinks.name,
      baseSpirits: drinks.baseSpirits,
      flavors: drinks.flavors,
      tried: drinks.tried,
      ingredients: drinks.ingredients,
      sourceUrl: drinks.sourceUrl,
      recipeBlocks: drinks.recipeBlocks,
      hasPhoto: sql<boolean>`${drinks.photo} is not null and ${drinks.photo} <> ''`,
    })
    .from(drinks)
    .where(and(eq(drinks.id, id), eq(drinks.isActive, true)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    baseSpirits: stringList(row.baseSpirits),
    flavors: stringList(row.flavors),
    tried: row.tried,
    hasPhoto: flag(row.hasPhoto),
    ingredients: row.ingredients,
    sourceUrl: row.sourceUrl,
    blocks: parseRecipeBlocks(row.recipeBlocks),
  };
}

export async function readDrinkPhoto(
  id: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!isUuid(id)) return null;
  assertDatabaseAvailable();
  if (!databaseConfigured()) {
    const drink = [...ephemeralDrinks().values()].find(
      (row) => row.id === id && row.isActive,
    );
    if (!drink) return null;
    return decodeStoredPhoto(drink.photo, drink.photoType);
  }

  const [row] = await getDb()
    .select({ photo: drinks.photo, photoType: drinks.photoType })
    .from(drinks)
    .where(and(eq(drinks.id, id), eq(drinks.isActive, true)))
    .limit(1);
  if (!row) return null;
  return decodeStoredPhoto(row.photo, row.photoType);
}

function toCard(drink: EphemeralDrink): DrinkCard {
  return {
    id: drink.id,
    name: drink.name,
    baseSpirits: drink.baseSpirits,
    flavors: drink.flavors,
    tried: drink.tried,
    hasPhoto: drink.hasPhoto,
  };
}

function toDetail(drink: EphemeralDrink): DrinkDetail {
  return {
    ...toCard(drink),
    ingredients: drink.ingredients,
    sourceUrl: drink.sourceUrl,
    blocks: drink.blocks,
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

function flag(value: unknown): boolean {
  return value === true || value === "t" || value === "true";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
