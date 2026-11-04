import type { DishIllustration } from "@/lib/illustrations";
import type { DishWall } from "@/server/menu-view";

export type WallDish = {
  id: string;
  name: string;
  categoryName: string;
  tried: boolean;
  description: string | null;
  illustration: DishIllustration | null;
};

export type WallCategory = {
  name: string;
};

/** The dish wall as the home page renders it. */
export type HomeWall = {
  heading: string;
  brushHeading: boolean;
  emptyMessage: string | null;
  categories: WallCategory[];
  selectedCategory: string | null;
  dishes: WallDish[];
};

const EMPTY_MENU = "菜单还空着，等家里添几道菜。";

export function toHomeWall(
  wall: DishWall,
  illustrationFor: (dishId: string) => DishIllustration | null,
): HomeWall {
  const unknown = wall.unknownCategory;
  return {
    heading: unknown ? "没有这个分类" : (wall.selectedCategory ?? "全部菜品"),
    brushHeading: !unknown,
    emptyMessage: unknown
      ? "没有这个分类。"
      : wall.dishes.length === 0
        ? wall.selectedCategory
          ? "这个分类还没有菜。"
          : EMPTY_MENU
        : null,
    categories: wall.categories.map((category) => ({ name: category.name })),
    selectedCategory: wall.selectedCategory,
    dishes: wall.dishes.map((dish) => ({
      id: dish.id,
      name: dish.name,
      categoryName: dish.categoryName,
      tried: dish.tried,
      description: dish.description,
      illustration: illustrationFor(dish.id),
    })),
  };
}

/**
 * Identity of the server-rendered wall. Illustration URLs are left out:
 * a sync changes dishes, not the static files.
 */
export function wallKey(wall: HomeWall): string {
  return JSON.stringify({
    heading: wall.heading,
    brushHeading: wall.brushHeading,
    emptyMessage: wall.emptyMessage,
    selectedCategory: wall.selectedCategory,
    categories: wall.categories.map((category) => category.name),
    dishes: wall.dishes.map((dish) => [
      dish.id,
      dish.name,
      dish.categoryName,
      dish.tried,
      dish.description,
    ]),
  });
}

/**
 * What the wall should show.
 *
 * `router.refresh()` updates `server` on the non-empty path. When the page
 * started empty, that refresh can leave `server` untouched. A sync snapshot
 * in `override` is shown until a later server payload actually changes.
 */
export function reconcileWall(
  trackedKey: string,
  server: HomeWall,
  override: HomeWall | null,
): { trackedKey: string; override: HomeWall | null; visible: HomeWall } {
  const serverKey = wallKey(server);
  if (trackedKey !== serverKey) {
    return { trackedKey: serverKey, override: null, visible: server };
  }
  return { trackedKey, override, visible: override ?? server };
}
