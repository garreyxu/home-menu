import { describe, expect, it } from "vitest";

import { groupCategoriesWithDishes, orderMenuItems } from "@/server/menu-view";

describe("groupCategoriesWithDishes", () => {
  it("keeps an empty category and groups dishes in row order", () => {
    const grouped = groupCategoriesWithDishes([
      {
        categoryId: "c1",
        categoryName: "家常菜",
        sortOrder: 0,
        dishId: null,
        notionPageId: null,
        dishName: null,
        description: null,
        photoKey: null,
        isActive: null,
      },
      {
        categoryId: "c2",
        categoryName: "汤品",
        sortOrder: 1,
        dishId: "d1",
        notionPageId: null,
        dishName: "紫菜蛋花汤",
        description: "清汤",
        photoKey: null,
        isActive: true,
      },
      {
        categoryId: "c2",
        categoryName: "汤品",
        sortOrder: 1,
        dishId: "d2",
        notionPageId: "notion-1",
        dishName: "番茄蛋汤",
        description: null,
        photoKey: "photos/tomato",
        isActive: false,
      },
    ]);

    expect(grouped).toEqual([
      { id: "c1", name: "家常菜", sortOrder: 0, dishes: [] },
      {
        id: "c2",
        name: "汤品",
        sortOrder: 1,
        dishes: [
          {
            id: "d1",
            notionPageId: null,
            name: "紫菜蛋花汤",
            description: "清汤",
            photoKey: null,
            isActive: true,
          },
          {
            id: "d2",
            notionPageId: "notion-1",
            name: "番茄蛋汤",
            description: null,
            photoKey: "photos/tomato",
            isActive: false,
          },
        ],
      },
    ]);
  });
});

describe("orderMenuItems", () => {
  it("orders by day, then meal, then created time", () => {
    const sunday = new Date("2026-01-04T00:00:00Z");
    const later = new Date("2026-01-04T01:00:00Z");
    const ordered = orderMenuItems([
      {
        id: "b",
        dayOfWeek: 0,
        meal: "dinner" as const,
        createdAt: sunday,
      },
      {
        id: "c",
        dayOfWeek: 1,
        meal: "breakfast" as const,
        createdAt: sunday,
      },
      {
        id: "a2",
        dayOfWeek: 0,
        meal: "breakfast" as const,
        createdAt: later,
      },
      {
        id: "a1",
        dayOfWeek: 0,
        meal: "breakfast" as const,
        createdAt: sunday,
      },
    ]);

    expect(ordered.map((item) => item.id)).toEqual(["a1", "a2", "b", "c"]);
  });
});
