import type { DishIllustration } from "@/lib/illustrations";
import type { CategoryWithDishes, DishWall } from "@/server/menu-view";

export type WallDish = {
  id: string;
  notionPageId: string | null;
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
  /**
   * Watercolor thumbs for every catalog dish, keyed by dish id.
   * Week-menu chips read this map. It is not limited to `dishes`, which
   * only contains the selected category.
   */
  thumbs: Record<string, string>;
};

const EMPTY_MENU = "菜单还空着，等家里添几道菜。";

/**
 * `catalog` is the unfiltered category list. Week-menu thumbs come from
 * every dish in it, so a selected category cannot replace a scheduled
 * dish's watercolor with the first-character fallback. `wall.dishes`
 * stays limited to that category for the dish wall.
 */
export function toHomeWall(
  wall: DishWall,
  illustrationFor: (notionPageId: string | null) => DishIllustration | null,
  catalog: readonly CategoryWithDishes[],
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
      notionPageId: dish.notionPageId,
      name: dish.name,
      categoryName: dish.categoryName,
      tried: dish.tried,
      description: dish.description,
      illustration: illustrationFor(dish.notionPageId),
    })),
    thumbs: catalogThumbs(catalog, illustrationFor),
  };
}

function catalogThumbs(
  catalog: readonly CategoryWithDishes[],
  illustrationFor: (notionPageId: string | null) => DishIllustration | null,
): Record<string, string> {
  const thumbs: Record<string, string> = {};
  for (const category of catalog) {
    for (const dish of category.dishes) {
      const illustration = illustrationFor(dish.notionPageId);
      if (illustration) thumbs[dish.id] = illustration.thumb;
    }
  }
  return thumbs;
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
      dish.notionPageId,
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
