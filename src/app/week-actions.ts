"use server";

import { validateCustomName } from "@/lib/custom-name";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { MENU_ACTION_ERROR, type MenuActionResult } from "@/lib/menu-slots";
import { requireSession } from "@/lib/auth/require-session";
import { DishNotFoundError } from "@/server/menu-errors";
import {
  moveStoredMenuItem,
  addMenuItem,
  getWeek,
  removeMenuItem,
  writeCustomMenuItem,
} from "@/server/menu";
import { toWeekMenuView } from "@/server/week-menu";
import {
  assertSundayWeekStart,
  assertDayOfWeek,
  assertMeal,
  MenuInputError,
  parseMenuSlot,
} from "@/server/week";

async function changeSlot(
  input: unknown,
  change: "add" | "remove",
): Promise<MenuActionResult> {
  await requireSession();

  try {
    const value = input as Record<string, unknown> | null;
    const customRemove =
      change === "remove" && value && typeof value.id === "string";
    const slot = customRemove
      ? {
          weekStart: assertSundayWeekStart(String(value.weekStart ?? "")),
          dayOfWeek: assertDayOfWeek(Number(value.dayOfWeek)),
          meal: assertMeal(String(value.meal)),
          id: assertItemId(value.id),
        }
      : parseMenuSlot(input);
    let added = false;
    if (change === "add") {
      const result = await addMenuItem(parseMenuSlot(input));
      added = result.created;
    } else {
      await removeMenuItem(slot);
    }
    const week = await getWeek(slot.weekStart);
    revalidatePath("/");
    return {
      ok: true,
      week: toWeekMenuView(week, slot.weekStart),
      added,
    };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof DishNotFoundError) {
      return { ok: false, error: MENU_ACTION_ERROR.missingDish };
    }
    if (error instanceof MenuInputError) {
      return { ok: false, error: MENU_ACTION_ERROR.invalid };
    }
    console.error("[menu] Could not update the weekly menu.");
    return { ok: false, error: MENU_ACTION_ERROR.failed };
  }
}

export async function addDishToSlot(input: unknown): Promise<MenuActionResult> {
  return changeSlot(input, "add");
}

export async function removeDishFromSlot(
  input: unknown,
): Promise<MenuActionResult> {
  return changeSlot(input, "remove");
}

function assertItemId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new MenuInputError("条目不对。");
  return value;
}

async function customAction(
  input: unknown,
  rename: boolean,
): Promise<MenuActionResult> {
  await requireSession();
  try {
    if (!input || typeof input !== "object")
      throw new MenuInputError("条目不对。");
    const v = input as Record<string, unknown>;
    const result = await writeCustomMenuItem({
      ...(rename
        ? { id: assertItemId(v.id) }
        : { weekStart: assertSundayWeekStart(String(v.weekStart ?? "")) }),
      name: validateCustomName(v.name),
      day: assertDayOfWeek(typeof v.day === "number" ? v.day : NaN),
      meal: assertMeal(String(v.meal)),
    });
    if (!result.created) return { ok: false, error: "这顿已经有了" };
    revalidatePath("/");
    return {
      ok: true,
      added: !rename,
      week: toWeekMenuView(await getWeek(result.weekStart), result.weekStart),
    };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof MenuInputError)
      return { ok: false, error: error.message };
    console.error("[menu] Could not update custom item.");
    return { ok: false, error: MENU_ACTION_ERROR.failed };
  }
}
export async function addCustomItem(input: unknown): Promise<MenuActionResult> {
  return customAction(input, false);
}
export async function renameCustomItem(
  input: unknown,
): Promise<MenuActionResult> {
  return customAction(input, true);
}

export async function moveMenuItem(
  itemId: string,
  targetDay: number,
  targetMeal: string,
  weekStart: string,
): Promise<MenuActionResult> {
  await requireSession();
  try {
    await moveStoredMenuItem(
      assertItemId(itemId),
      weekStart,
      targetDay,
      targetMeal,
    );
    revalidatePath("/");
    return {
      ok: true,
      added: false,
      week: toWeekMenuView(await getWeek(weekStart), weekStart),
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      ok: false,
      error:
        error instanceof MenuInputError && error.message === "这顿已经有了"
          ? error.message
          : "没挪成，再试一次",
    };
  }
}
