import { describe, expect, it } from "vitest";

import { reconcileWall, toHomeWall, type HomeWall } from "@/lib/home-wall";
import { buildDishWall, type CategoryWithDishes } from "@/server/menu-view";

const EMPTY_MESSAGE = "菜单还空着，等家里添几道菜。";

function wall(
  dishes: HomeWall["dishes"],
  emptyMessage: string | null,
): HomeWall {
  return {
    heading: dishes.length === 0 ? "全部菜品" : "全部菜品",
    brushHeading: true,
    emptyMessage,
    categories: dishes.length === 0 ? [] : [{ name: "家常菜" }],
    selectedCategory: null,
    dishes,
  };
}

const pork = {
  id: "dish-pork",
  notionPageId: null,
  name: "红烧肉",
  categoryName: "家常菜",
  tried: true,
  description: "酱香",
  illustration: null,
};

describe("toHomeWall", () => {
  it("uses the empty-menu copy when the catalog has no dishes", () => {
    const built = buildDishWall([], null);
    const home = toHomeWall(built, () => null);
    expect(home.dishes).toEqual([]);
    expect(home.emptyMessage).toBe(EMPTY_MESSAGE);
    expect(home.heading).toBe("全部菜品");
  });
});

describe("reconcileWall", () => {
  it("keeps the synced dishes when refresh leaves the empty server wall in place", () => {
    const empty = wall([], EMPTY_MESSAGE);
    const filled = wall([pork], null);
    const started = reconcileWall("server-empty", empty, null);
    expect(started.visible.emptyMessage).toBe(EMPTY_MESSAGE);
    expect(started.visible.dishes).toHaveLength(0);

    const afterSync = reconcileWall(started.trackedKey, empty, filled);
    expect(afterSync.visible.dishes.map((dish) => dish.name)).toEqual([
      "红烧肉",
    ]);
    expect(afterSync.visible.emptyMessage).toBeNull();
    expect(afterSync.visible.dishes).toHaveLength(1);
    expect(afterSync.override).toBe(filled);
  });

  it("follows a server payload once refresh actually changes the wall", () => {
    const empty = wall([], EMPTY_MESSAGE);
    const filled = wall([pork], null);
    const holding = reconcileWall("server-empty", empty, filled);
    const refreshed = reconcileWall(holding.trackedKey, filled, filled);
    expect(refreshed.override).toBeNull();
    expect(refreshed.visible.dishes).toHaveLength(1);
    expect(refreshed.visible.emptyMessage).toBeNull();
  });

  it("shows server dishes immediately when the page did not start empty", () => {
    const filled = wall([pork], null);
    const visible = reconcileWall("already", filled, null);
    expect(visible.trackedKey).not.toBe("already");
    expect(visible.override).toBeNull();
    expect(visible.visible.dishes).toHaveLength(1);
  });
});

describe("category with dishes still builds", () => {
  it("keeps an active dish on the wall", () => {
    const categories: CategoryWithDishes[] = [
      {
        id: "c-home",
        name: "家常菜",
        sortOrder: 0,
        dishes: [
          {
            id: "dish-pork",
            notionPageId: null,
            name: "红烧肉",
            description: "酱香",
            photoKey: null,
            isActive: true,
            tried: true,
          },
        ],
      },
    ];
    const home = toHomeWall(buildDishWall(categories, null), () => null);
    expect(home.emptyMessage).toBeNull();
    expect(home.dishes[0]?.tried).toBe(true);
  });
});
