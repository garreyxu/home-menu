"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/require-session";
import { toHomeWall, type HomeWall } from "@/lib/home-wall";
import { illustrationForDish, publicFileExists } from "@/lib/illustrations";
import { buildDishWall } from "@/server/menu-view";
import { listDishesByCategory } from "@/server/menu";

/** Fresh wall after a Notion sync. Reads the database; does not trust the page cache. */
export async function reloadDishWall(
  categoryParam: string | null,
): Promise<HomeWall> {
  await requireSession();
  revalidatePath("/", "layout");
  const catalog = await listDishesByCategory();
  const wall = buildDishWall(catalog, categoryParam);
  return toHomeWall(wall, (dishId) =>
    illustrationForDish(dishId, publicFileExists),
  );
}
