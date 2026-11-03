"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { MENU_ACTION_ERROR, type MenuActionResult } from "@/lib/menu-slots";
import { requireSession } from "@/lib/auth/require-session";
import { DishNotFoundError } from "@/server/menu-errors";
import { addMenuItem, getWeek, removeMenuItem } from "@/server/menu";
import { toWeekMenuView } from "@/server/week-menu";
import { MenuInputError, parseMenuSlot } from "@/server/week";

async function changeSlot(
  input: unknown,
  change: "add" | "remove",
): Promise<MenuActionResult> {
  await requireSession();

  try {
    const slot = parseMenuSlot(input);
    let added = false;
    if (change === "add") {
      const result = await addMenuItem(slot);
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
