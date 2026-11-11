import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { shoppingChecks } from "@/server/db/schema";
import { getWeek } from "@/server/menu";
import { buildShoppingList, shoppingRows } from "@/lib/shopping-list";

// Match menu.ts's local-only fallback; Vercel without a DB fails in getWeek.
function localChecks() {
  const scope = globalThis as typeof globalThis & {
    __homeMenuShoppingChecks?: Map<string, Set<string>>;
  };
  return (scope.__homeMenuShoppingChecks ??= new Map());
}
export function clearLocalShoppingWeek(weekId: string) {
  localChecks().delete(weekId);
}
export async function readShoppingList(weekStart: string) {
  const week = await getWeek(weekStart);
  const list = buildShoppingList(week?.items ?? []);
  const checks = !week
    ? []
    : !process.env.DATABASE_URL?.trim()
      ? [...(localChecks().get(week.id) ?? [])]
      : (
          await getDb()
            .select({ ingredient: shoppingChecks.ingredient })
            .from(shoppingChecks)
            .where(eq(shoppingChecks.weeklyMenuId, week.id))
        ).map((row) => row.ingredient);
  const names = new Set(shoppingRows(list).map((row) => row.name));
  return {
    list,
    checked: checks.filter((name) => names.has(name)),
    menuEmpty: !week?.items.length,
  };
}
export async function writeShoppingCheck(
  weekStart: string,
  ingredient: string,
  checked: boolean,
  subject: string,
) {
  const week = await getWeek(weekStart);
  if (!week) return;
  if (!process.env.DATABASE_URL?.trim()) {
    const checks = localChecks().get(week.id) ?? new Set<string>();
    if (checked) checks.add(ingredient);
    else checks.delete(ingredient);
    localChecks().set(week.id, checks);
    return;
  }
  if (checked)
    await getDb()
      .insert(shoppingChecks)
      .values({ weeklyMenuId: week.id, ingredient, checkedBy: subject })
      .onConflictDoNothing();
  else
    await getDb()
      .delete(shoppingChecks)
      .where(
        and(
          eq(shoppingChecks.weeklyMenuId, week.id),
          eq(shoppingChecks.ingredient, ingredient),
        ),
      );
}
export async function clearStoredShoppingChecks(weekStart: string) {
  const week = await getWeek(weekStart);
  if (!week) return;
  if (!process.env.DATABASE_URL?.trim()) {
    clearLocalShoppingWeek(week.id);
    return;
  }
  await getDb()
    .delete(shoppingChecks)
    .where(eq(shoppingChecks.weeklyMenuId, week.id));
}
