"use server";
import { unstable_rethrow } from "next/navigation";
import { requireSession } from "@/lib/auth/require-session";
import { assertSundayWeekStart, MenuInputError } from "@/server/week";
import {
  readShoppingList,
  writeShoppingCheck,
  clearStoredShoppingChecks,
} from "@/server/shopping-list";
import {
  buildShoppingList,
  shoppingRows,
  type ShoppingList,
} from "@/lib/shopping-list";
import { getWeek } from "@/server/menu";

export type ShoppingData = {
  list: ShoppingList;
  checked: string[];
  menuEmpty: boolean;
};
export type ShoppingResult =
  { ok: true; data: ShoppingData } | { ok: false; error: string };
function validateWeek(value: unknown) {
  return assertSundayWeekStart(typeof value === "string" ? value : "");
}
async function run(
  weekStart: unknown,
  mutate?: (week: string, subject: string) => Promise<void>,
): Promise<ShoppingResult> {
  const session = await requireSession();
  try {
    const week = validateWeek(weekStart);
    await mutate?.(week, session.subject);
    return { ok: true, data: await readShoppingList(week) };
  } catch (error) {
    unstable_rethrow(error);
    if (!(error instanceof MenuInputError))
      console.error("[shopping] Could not load or update shopping checks.");
    return { ok: false, error: "清单没拿到，再试一次" };
  }
}
export async function loadShoppingList(
  weekStart: unknown,
): Promise<ShoppingResult> {
  return run(weekStart);
}
export async function toggleShoppingCheck(
  weekStart: unknown,
  ingredient: unknown,
  checked: unknown,
): Promise<ShoppingResult> {
  return run(weekStart, async (week, subject) => {
    if (
      typeof ingredient !== "string" ||
      !ingredient.trim() ||
      ingredient !== ingredient.trim() ||
      ingredient.length > 200 ||
      /[\u0000-\u001f，,]/.test(ingredient) ||
      typeof checked !== "boolean"
    )
      throw new MenuInputError("Invalid shopping check");
    const menu = await getWeek(week);
    if (
      !shoppingRows(buildShoppingList(menu?.items ?? [])).some(
        (row) => row.name === ingredient,
      )
    )
      throw new MenuInputError(
        "Ingredient is not in this week's shopping list",
      );
    await writeShoppingCheck(week, ingredient, checked, subject);
  });
}
export async function clearShoppingChecks(
  weekStart: unknown,
): Promise<ShoppingResult> {
  return run(weekStart, async (week) => clearStoredShoppingChecks(week));
}
