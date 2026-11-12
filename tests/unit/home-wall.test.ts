import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WeekBoard } from "@/components/week-board";
import type { DishIllustration } from "@/lib/illustrations";
import { reconcileWall, toHomeWall, type HomeWall } from "@/lib/home-wall";
import {
  buildDishWall,
  type CategoryWithDishes,
  type DishSummary,
} from "@/server/menu-view";

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
    thumbs: {},
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

function summary(
  id: string,
  name: string,
  notionPageId: string | null,
): DishSummary {
  return {
    id,
    notionPageId,
    name,
    description: null,
    photoKey: null,
    isActive: true,
    tried: false,
  };
}

function illustrationFor(notionPageId: string | null): DishIllustration | null {
  if (!notionPageId) return null;
  const thumb = `/illustrations/${notionPageId}-240.webp?v=1`;
  return { src: thumb, srcSet: thumb, sizes: "24px", thumb };
}

describe("toHomeWall", () => {
  it("uses the empty-menu copy when the catalog has no dishes", () => {
    const built = buildDishWall([], null);
    const home = toHomeWall(built, () => null, []);
    expect(home.thumbs).toEqual({});
    expect(home.dishes).toEqual([]);
    expect(home.emptyMessage).toBe(EMPTY_MESSAGE);
    expect(home.heading).toBe("全部菜品");
  });

  it("keeps scheduled-dish thumbs when the wall is filtered to another category", () => {
    const malaId = "a".repeat(32);
    const porkId = "b".repeat(32);
    const categories: CategoryWithDishes[] = [
      {
        id: "c-mala",
        name: "麻辣",
        sortOrder: 0,
        dishes: [
          summary("dish-mala", "麻辣烫", malaId),
          summary("dish-porridge", "白粥", null),
        ],
      },
      {
        id: "c-pork",
        name: "猪",
        sortOrder: 1,
        dishes: [summary("dish-pork", "红烧肉", porkId)],
      },
    ];
    const porkWall = toHomeWall(
      buildDishWall(categories, "猪"),
      illustrationFor,
      categories,
    );
    const malaWall = toHomeWall(
      buildDishWall(categories, "麻辣"),
      illustrationFor,
      categories,
    );

    expect(porkWall.dishes.map((dish) => dish.name)).toEqual(["红烧肉"]);
    expect(malaWall.dishes.map((dish) => dish.name)).toEqual([
      "麻辣烫",
      "白粥",
    ]);
    expect(porkWall.thumbs).toEqual(malaWall.thumbs);
    expect(porkWall.thumbs).toEqual({
      "dish-mala": `/illustrations/${malaId}-240.webp?v=1`,
      "dish-pork": `/illustrations/${porkId}-240.webp?v=1`,
    });
    expect(porkWall.dishes[0]?.illustration?.thumb).toBe(
      porkWall.thumbs["dish-pork"],
    );

    const html = renderToStaticMarkup(
      createElement(WeekBoard, {
        weekStart: "2026-11-08",
        currentWeekStart: "2026-11-08",
        todayIso: "2026-11-09",
        categoryParam: "猪",
        thumbs: porkWall.thumbs,
        onCustom: () => {},
        onRemove: () => {},
        items: [
          {
            id: "item-mala",
            dayOfWeek: 1,
            meal: "lunch",
            dishId: "dish-mala",
            dishName: "麻辣烫",
          },
          {
            id: "item-porridge",
            dayOfWeek: 1,
            meal: "dinner",
            dishId: "dish-porridge",
            dishName: "白粥",
          },
        ],
      }),
    );
    expect(html).toContain(`src="${porkWall.thumbs["dish-mala"]}"`);
    expect(html).toContain('class="week-thumb illus-blend-thumb"');
    const fallbacks = [
      ...html.matchAll(
        /class="week-thumb week-thumb-fallback font-brush"[^>]*>([^<]*)</g,
      ),
    ].map((match) => match[1]?.trim());
    expect(fallbacks).toEqual(["白"]);
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
    const home = toHomeWall(
      buildDishWall(categories, null),
      () => null,
      categories,
    );
    expect(home.emptyMessage).toBeNull();
    expect(home.dishes[0]?.tried).toBe(true);
  });
});
