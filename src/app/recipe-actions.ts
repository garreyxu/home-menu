"use server";

import { unstable_rethrow } from "next/navigation";
import { requireSession } from "@/lib/auth/require-session";
import type { RecipeBlock } from "@/lib/recipe-blocks";
import { getDishRecipe } from "@/server/menu";
import { MenuInputError } from "@/server/week";

export type RecipeActionResult =
  | {
      ok: true;
      name: string;
      blocks: RecipeBlock[];
      cookTime?: string | null;
      mainIngredient?: string | null;
      tried: boolean;
    }
  | { ok: false; error: string };

/** Read-only recipe for a signed-in session. The blocks come from the database, not the client. */
export async function loadDishRecipe(
  dishId: unknown,
): Promise<RecipeActionResult> {
  await requireSession();

  try {
    if (typeof dishId !== "string") {
      return { ok: false, error: "这道菜的编号不对。" };
    }
    const recipe = await getDishRecipe(dishId);
    if (!recipe) return { ok: false, error: "找不到这道菜。" };
    return { ok: true, ...recipe };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof MenuInputError) {
      return { ok: false, error: "这道菜的编号不对。" };
    }
    console.error("[recipe] Could not load the recipe.");
    return { ok: false, error: "做法没能打开，请再试一次。" };
  }
}
