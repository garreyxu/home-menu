import { describe, expect, it } from "vitest";
import { buildShoppingList, shoppingRows } from "../../src/lib/shopping-list";

describe("shopping list", () => {
  it("splits mixed commas, trims spaces, drops empties and dedupes names in menu order", () => {
    const list = buildShoppingList([
      { dishName: "甲", ingredients: " 鸡腿 ， 鸡蛋,鸡腿 , , 番茄，" },
      { dishName: "乙", ingredients: "鸡蛋，鸡腿" },
      { dishName: "甲", ingredients: "鸡腿" },
    ]);
    expect(list.groups.map((g) => g.name)).toEqual(["肉", "蔬菜菌菇", "豆蛋"]);
    expect(shoppingRows(list).find((r) => r.name === "鸡腿")).toEqual({
      name: "鸡腿",
      dishes: ["甲", "乙"],
      optional: false,
    });
    expect(shoppingRows(list)).toHaveLength(3);
  });
  it("strips optional suffixes with spacing and case, requiring every use to be optional", () => {
    const rows = shoppingRows(
      buildShoppingList([
        {
          dishName: "甲",
          ingredients:
            "葱 ( OPTIONAL ), 番茄（optional）,鸡腿(optional),鸡蛋 (Optional) , （optional）",
        },
        {
          dishName: "乙",
          ingredients: "葱（ Optional ），番茄,鸡腿 ( optional )",
        },
      ]),
    );
    expect(Object.fromEntries(rows.map((r) => [r.name, r.optional]))).toEqual({
      葱: true,
      番茄: false,
      鸡腿: true,
      鸡蛋: true,
    });
  });
  it("groups ingredients in spec order and keeps pantry out of main groups", () => {
    const list = buildShoppingList([
      {
        dishName: "甲",
        ingredients:
          "神秘食材,盐,虾仁,鸡腿,面粉,香菇,豆腐,八角,生抽,老抽,蚝油,糖,醋,料酒,淀粉",
      },
    ]);
    expect(list.groups.map((g) => g.name)).toEqual([
      "肉",
      "海鲜",
      "蔬菜菌菇",
      "豆蛋",
      "主食面粉",
      "调料干货",
      "其他",
    ]);
    expect(list.pantry.map((r) => r.name)).toEqual([
      "盐",
      "生抽",
      "老抽",
      "蚝油",
      "糖",
      "醋",
      "料酒",
      "淀粉",
    ]);
    expect(
      list.groups.flatMap((g) => g.rows).some((r) => r.name === "盐"),
    ).toBe(false);
  });
  it("ignores custom items, missing ingredients and empty menus", () => {
    expect(buildShoppingList([])).toEqual({ groups: [], pantry: [] });
    expect(
      buildShoppingList([
        { customName: "外卖" },
        {},
        { dishName: "甲", ingredients: null },
        { customName: "聚餐", dishName: "聚餐", ingredients: "鸡腿" },
      ]),
    ).toEqual({ groups: [], pantry: [] });
  });
});
