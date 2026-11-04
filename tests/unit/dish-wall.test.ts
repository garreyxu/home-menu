import { afterEach, describe, expect, it, vi } from "vitest";

import { categoryFilterHref } from "@/lib/category-filter";
import { listDishesByCategory } from "@/server/menu";
import { sampleDishCatalog } from "@/server/sample-catalog";
import {
  buildDishWall,
  groupActiveDishesByCategory,
  type CategoryDishJoinRow,
} from "@/server/menu-view";

function row(
  partial: Partial<CategoryDishJoinRow> &
    Pick<CategoryDishJoinRow, "categoryId" | "categoryName" | "sortOrder">,
): CategoryDishJoinRow {
  return {
    dishId: null,
    notionPageId: null,
    dishName: null,
    description: null,
    photoKey: null,
    isActive: null,
    tried: null,
    hasBody: null,
    ...partial,
  };
}

describe("groupActiveDishesByCategory", () => {
  it("drops inactive dishes and sorts categories then names", () => {
    const grouped = groupActiveDishesByCategory([
      row({
        categoryId: "c-cold",
        categoryName: "凉菜",
        sortOrder: 2,
        dishId: "d-cucumber",
        dishName: "拍黄瓜",
        description: "蒜香",
        isActive: true,
      }),
      row({
        categoryId: "c-home",
        categoryName: "家常菜",
        sortOrder: 0,
        dishId: "d-pork",
        dishName: "红烧肉",
        isActive: false,
        photoKey: "secret/pork",
      }),
      row({
        categoryId: "c-home",
        categoryName: "家常菜",
        sortOrder: 0,
        dishId: "d-gongbao",
        dishName: "宫保鸡丁",
        description: "微辣",
        photoKey: "secret/gongbao",
        isActive: true,
      }),
      row({
        categoryId: "c-staple",
        categoryName: "主食",
        sortOrder: 0,
        dishId: "d-rice",
        dishName: "米饭",
        isActive: true,
      }),
      row({
        categoryId: "c-home",
        categoryName: "家常菜",
        sortOrder: 0,
        dishId: "d-tomato",
        dishName: "番茄炒蛋",
        isActive: true,
      }),
      row({
        categoryId: "c-home",
        categoryName: "家常菜",
        sortOrder: 0,
        dishId: "d-tomato",
        dishName: "番茄炒蛋",
        isActive: true,
      }),
    ]);

    expect(grouped.map((category) => category.name)).toEqual([
      ...["家常菜", "主食"].sort((a, b) => a.localeCompare(b, "zh-CN")),
      "凉菜",
    ]);

    const home = grouped.find((category) => category.name === "家常菜");
    expect(home?.dishes.map((dish) => dish.name)).toEqual(
      ["宫保鸡丁", "番茄炒蛋"].sort((a, b) => a.localeCompare(b, "zh-CN")),
    );
    expect(home?.dishes.map((dish) => dish.id)).not.toContain("d-pork");
    expect(
      home?.dishes.find((dish) => dish.name === "宫保鸡丁")?.photoKey,
    ).toBe("secret/gongbao");
    expect(
      grouped.find((category) => category.name === "凉菜")?.dishes,
    ).toEqual([
      {
        id: "d-cucumber",
        notionPageId: null,
        name: "拍黄瓜",
        description: "蒜香",
        photoKey: null,
        isActive: true,
        tried: false,
      },
    ]);
  });

  it("shows an active dish whether or not the body flag is set", () => {
    const grouped = groupActiveDishesByCategory([
      row({
        categoryId: "c-home",
        categoryName: "家常菜",
        sortOrder: 0,
        dishId: "d-empty",
        notionPageId: "page-empty",
        dishName: "只有菜名",
        isActive: true,
        tried: true,
        hasBody: false,
      }),
      row({
        categoryId: "c-home",
        categoryName: "家常菜",
        sortOrder: 0,
        dishId: "d-sample",
        dishName: "番茄炒蛋",
        isActive: true,
        hasBody: null,
      }),
      row({
        categoryId: "c-home",
        categoryName: "家常菜",
        sortOrder: 0,
        dishId: "d-written",
        notionPageId: "page-written",
        dishName: "红烧肉",
        isActive: true,
        tried: true,
        hasBody: true,
      }),
    ]);

    expect(grouped[0]?.dishes.map((dish) => dish.name)).toEqual(
      ["只有菜名", "番茄炒蛋", "红烧肉"].sort((a, b) =>
        a.localeCompare(b, "zh-CN"),
      ),
    );
  });

  it("keeps a category whose dishes are all inactive", () => {
    const grouped = groupActiveDishesByCategory([
      row({
        categoryId: "c-soup",
        categoryName: "汤品",
        sortOrder: 1,
        dishId: "d-soup",
        dishName: "紫菜蛋花汤",
        isActive: false,
      }),
    ]);

    expect(grouped).toEqual([
      { id: "c-soup", name: "汤品", sortOrder: 1, dishes: [] },
    ]);
  });
});

describe("buildDishWall", () => {
  const catalog = groupActiveDishesByCategory([
    row({
      categoryId: "c-home",
      categoryName: "家常菜",
      sortOrder: 0,
      dishId: "d-tomato",
      dishName: "番茄炒蛋",
      isActive: true,
    }),
    row({
      categoryId: "c-soup",
      categoryName: "汤品",
      sortOrder: 1,
      dishId: "d-soup",
      dishName: "紫菜蛋花汤",
      description: "清汤",
      isActive: true,
    }),
    row({
      categoryId: "c-empty",
      categoryName: "凉菜",
      sortOrder: 3,
    }),
  ]);

  it("returns every active dish when the filter is empty", () => {
    const wall = buildDishWall(catalog, "  ");
    expect(wall.unknownCategory).toBe(false);
    expect(wall.selectedCategory).toBeNull();
    expect(wall.dishes.map((dish) => dish.name)).toEqual([
      "番茄炒蛋",
      "紫菜蛋花汤",
    ]);
    expect(wall.categories.map((category) => category.dishCount)).toEqual([
      1, 1, 0,
    ]);
  });

  it("keeps only the named category", () => {
    const wall = buildDishWall(catalog, "汤品");
    expect(wall.selectedCategory).toBe("汤品");
    expect(wall.unknownCategory).toBe(false);
    expect(wall.dishes).toEqual([
      {
        id: "d-soup",
        name: "紫菜蛋花汤",
        categoryName: "汤品",
        description: "清汤",
        photoKey: null,
        tried: false,
      },
    ]);
  });

  it("marks an unknown category and returns no dishes", () => {
    const wall = buildDishWall(catalog, "没有的分类");
    expect(wall.unknownCategory).toBe(true);
    expect(wall.selectedCategory).toBe("没有的分类");
    expect(wall.dishes).toEqual([]);
    expect(wall.categories.map((category) => category.name)).toEqual([
      "家常菜",
      "汤品",
      "凉菜",
    ]);
  });
});

describe("sampleDishCatalog", () => {
  it("follows sort_order and dish name, with no photos", () => {
    const catalog = sampleDishCatalog();
    expect(catalog.map((category) => category.name)).toEqual([
      "家常菜",
      "汤品",
      "主食",
      "凉菜",
    ]);
    const home = catalog[0]?.dishes ?? [];
    expect(home.map((dish) => dish.name)).toEqual(
      [...home.map((dish) => dish.name)].sort((a, b) =>
        a.localeCompare(b, "zh-CN"),
      ),
    );
    expect(home.every((dish) => dish.isActive && dish.photoKey === null)).toBe(
      true,
    );
    expect(catalog.flatMap((category) => category.dishes)).toHaveLength(12);
  });
});

describe("listDishesByCategory", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalVercelEnv = process.env.VERCEL_ENV;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;
    vi.restoreAllMocks();
  });

  it("uses the sample catalog when DATABASE_URL and VERCEL_ENV are unset", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.VERCEL_ENV;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(listDishesByCategory()).resolves.toEqual(sampleDishCatalog());
    expect(error).not.toHaveBeenCalled();
  });

  it.each(["production", "preview", "development"])(
    "throws when DATABASE_URL is missing and VERCEL_ENV is %s",
    async (vercelEnv) => {
      delete process.env.DATABASE_URL;
      process.env.VERCEL_ENV = vercelEnv;
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(listDishesByCategory()).rejects.toThrow(
        "DATABASE_URL is not set.",
      );
      expect(error).toHaveBeenCalledWith("[db] DATABASE_URL is not set.");
    },
  );
});

describe("categoryFilterHref", () => {
  it("clears the filter at / and encodes a category name", () => {
    expect(categoryFilterHref(null)).toBe("/");
    expect(categoryFilterHref("汤品")).toBe(
      `/?${new URLSearchParams({ category: "汤品" }).toString()}`,
    );
    expect(categoryFilterHref(null, "2026-01-04")).toBe("/?week=2026-01-04");
    expect(categoryFilterHref("汤品", "2026-01-04")).toBe(
      `/?${new URLSearchParams({ category: "汤品", week: "2026-01-04" }).toString()}`,
    );
  });
});
