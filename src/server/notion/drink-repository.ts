import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "@/server/db";
import { drinks } from "@/server/db/schema";
import type { DrinkRepository, DrinkUpsert } from "@/server/notion/drink-sync";

export function createDrinkRepository(db: Database): DrinkRepository {
  return {
    async listStored() {
      return db
        .select({
          notionPageId: drinks.notionPageId,
          isActive: drinks.isActive,
          photoFingerprint: drinks.photoFingerprint,
        })
        .from(drinks);
    },

    async upsert(input) {
      const inserted = await db
        .insert(drinks)
        .values(insertValues(input))
        .onConflictDoNothing({ target: drinks.notionPageId })
        .returning({ id: drinks.id });
      if (inserted[0]) return "added";

      await db
        .update(drinks)
        .set(updateValues(input))
        .where(eq(drinks.notionPageId, input.drink.notionPageId));
      return "updated";
    },

    async deactivate(notionPageIds) {
      if (notionPageIds.length === 0) return 0;
      const rows = await db
        .update(drinks)
        .set({
          isActive: false,
          photo: null,
          photoType: null,
          photoFingerprint: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(drinks.notionPageId, [...notionPageIds]),
            eq(drinks.isActive, true),
          ),
        )
        .returning({ id: drinks.id });
      return rows.length;
    },
  };
}

function insertValues(input: DrinkUpsert) {
  const photo = photoColumns(input.photo);
  return {
    notionPageId: input.drink.notionPageId,
    name: input.drink.name,
    baseSpirits: input.drink.baseSpirits,
    flavors: input.drink.flavors,
    ingredients: input.drink.ingredients,
    sourceUrl: input.drink.sourceUrl,
    tried: input.drink.tried,
    recipeBlocks: input.preserveBody ? null : input.drink.recipeBlocks,
    hasBody: input.preserveBody ? false : input.drink.hasBody,
    photo: photo.photo,
    photoType: photo.photoType,
    photoFingerprint: photo.photoFingerprint,
    isActive: true,
    updatedAt: new Date(),
  };
}

function updateValues(input: DrinkUpsert) {
  const photo = photoColumns(input.photo);
  return {
    name: input.drink.name,
    baseSpirits: input.drink.baseSpirits,
    flavors: input.drink.flavors,
    ingredients: input.drink.ingredients,
    sourceUrl: input.drink.sourceUrl,
    tried: input.drink.tried,
    isActive: true,
    updatedAt: new Date(),
    ...(input.preserveBody
      ? {}
      : {
          recipeBlocks: input.drink.recipeBlocks,
          hasBody: input.drink.hasBody,
        }),
    ...(input.photo.kind === "keep"
      ? {}
      : {
          photo: photo.photo,
          photoType: photo.photoType,
          photoFingerprint: photo.photoFingerprint,
        }),
  };
}

function photoColumns(photo: DrinkUpsert["photo"]): {
  photo: string | null;
  photoType: string | null;
  photoFingerprint: string | null;
} {
  if (photo.kind !== "set") {
    return { photo: null, photoType: null, photoFingerprint: null };
  }
  return {
    photo: photo.photo.base64,
    photoType: photo.photo.contentType,
    photoFingerprint: photo.photo.fingerprint,
  };
}
