import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildShoppingList,
  shoppingRows,
  missingShoppingDishes,
} from "../../src/lib/shopping-list";

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

const realDishes = [
  {
    dishName: "咖喱牛肉",
    ingredients: "牛腱或牛腩，大葱，洋葱，土豆，胡萝卜，咖喱块",
  },
  {
    dishName: "寿喜烧",
    ingredients:
      "肥牛，金针菇，娃娃菜，香菇，老豆腐，魔芋丝，胡萝卜，茼蒿，大葱，鸡蛋，寿喜烧汁",
  },
  {
    dishName: "麻辣烫",
    ingredients:
      "肥牛，肥羊，鱼豆腐，脆肠，午餐肉，鹌鹑蛋，牛肉丸，蟹肉棒，豆皮，娃娃菜，菠菜，土豆，腐竹，油条，豆腐，金针菇，海鲜菇，方便面，土豆粉，鸡蛋面",
  },
  {
    dishName: "万能酱汁",
    ingredients: "生抽，老抽，蚝油，蜂蜜，黑胡椒，陈醋，番茄酱，淀粉",
  },
  {
    dishName: "红烧鸡爪",
    ingredients: "鸡爪，葱，姜，花椒，八角，桂皮，香叶，啤酒，小米椒(optional)",
  },
  {
    dishName: "葱爆羊肉 II",
    ingredients: "羊通脊，大葱，皱皮青椒，高度白酒，姜，蒜，白洋葱(optional)",
  },
  { dishName: "豆酥鳕鱼", ingredients: "鳕鱼(或比目鱼)，豆酥，豆瓣酱" },
  { dishName: "麻辣拌", ingredients: "小葱，蒜，芝麻，辣椒面，小米椒，麻酱" },
  {
    dishName: "宫保鸡丁",
    ingredients: "鸡腿，花生米，干辣椒，大葱，姜，蒜，生抽，醋，糖，淀粉",
  },
];
it("groups the real Notion property shapes without changing displayed names", () => {
  const curry = buildShoppingList([realDishes[0]]);
  expect(curry.pantry).toEqual([]);
  expect(curry.groups.map((g) => [g.name, g.rows.map((r) => r.name)])).toEqual([
    ["肉", ["牛腱或牛腩"]],
    ["蔬菜菌菇", ["大葱", "洋葱", "土豆", "胡萝卜"]],
    ["调料干货", ["咖喱块"]],
  ]);
  const list = buildShoppingList(realDishes);
  const names = (group: string) =>
    list.groups.find((g) => g.name === group)!.rows.map((r) => r.name);
  for (const name of [
    "肥牛",
    "肥羊",
    "鸡爪",
    "羊通脊",
    "牛肉丸",
    "脆肠",
    "午餐肉",
  ])
    expect(names("肉")).toContain(name);
  for (const name of ["蟹肉棒", "鳕鱼(或比目鱼)"])
    expect(names("海鲜")).toContain(name);
  for (const name of [
    "老豆腐",
    "鸡蛋",
    "鱼豆腐",
    "豆皮",
    "腐竹",
    "豆腐",
    "豆酥",
    "鹌鹑蛋",
  ])
    expect(names("豆蛋")).toContain(name);
  for (const name of ["魔芋丝", "土豆粉", "鸡蛋面", "油条", "方便面"])
    expect(names("主食面粉")).toContain(name);
  for (const name of [
    "寿喜烧汁",
    "蜂蜜",
    "番茄酱",
    "辣椒面",
    "花生米",
    "干辣椒",
    "高度白酒",
    "麻酱",
  ])
    expect(names("调料干货")).toContain(name);
  for (const name of ["皱皮青椒", "白洋葱", "海鲜菇"])
    expect(names("蔬菜菌菇")).toContain(name);
  const rows = shoppingRows(list);
  expect(rows.find((r) => r.name === "大葱")!.dishes).toEqual([
    "咖喱牛肉",
    "寿喜烧",
    "葱爆羊肉 II",
    "宫保鸡丁",
  ]);
  expect(rows.find((r) => r.name === "白洋葱")!.optional).toBe(true);
  expect(
    shoppingRows(buildShoppingList([realDishes[4]])).find(
      (r) => r.name === "小米椒",
    )!.optional,
  ).toBe(true);
  expect(rows.find((r) => r.name === "小米椒")!.optional).toBe(false);
  expect(list.groups.map((g) => g.name)).toEqual([
    "肉",
    "海鲜",
    "蔬菜菌菇",
    "豆蛋",
    "主食面粉",
    "调料干货",
  ]);
  expect(buildShoppingList([realDishes[3]]).pantry.map((r) => r.name)).toEqual([
    "生抽",
    "老抽",
    "蚝油",
    "黑胡椒",
    "陈醋",
    "淀粉",
  ]);
  expect(buildShoppingList([realDishes[8]]).pantry.map((r) => r.name)).toEqual([
    "生抽",
    "醋",
    "糖",
    "淀粉",
  ]);
});
it("keeps normalized pantry names displayed as written and merges optional flags across dishes", () => {
  const list = buildShoppingList([
    {
      dishName: "甲",
      ingredients: "生抽（或酱油）(OPTIONAL)，小葱，蒜，芝麻，",
    },
    { dishName: "乙", ingredients: "生抽（或酱油）" },
  ]);
  expect(list.pantry).toEqual([
    { name: "生抽（或酱油）", dishes: ["甲", "乙"], optional: false },
  ]);
  expect(list.groups.flatMap((g) => g.rows).map((r) => r.name)).toEqual([
    "小葱",
    "蒜",
    "芝麻",
  ]);
  expect(
    shoppingRows(
      buildShoppingList([
        { dishName: "甲", ingredients: "，小葱，蒜，芝麻，" },
      ]),
    ),
  ).toHaveLength(3);
});

const menuMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/menu", () => ({ getWeek: menuMock }));
import { readShoppingList } from "@/server/shopping-list";
afterEach(() => vi.unstubAllEnvs());
it("returns missing property data in menu order, deduping and excluding custom items", async () => {
  const items = [
    { dishName: "咖喱牛肉", ingredients: null },
    { dishName: "寿喜烧", ingredients: "" },
    { dishName: "麻辣烫", ingredients: "  " },
    { dishName: "咖喱牛肉", ingredients: null },
    { dishName: "外卖", customName: "外卖", ingredients: null },
    realDishes[8],
  ];
  expect(missingShoppingDishes(items)).toEqual([
    "咖喱牛肉",
    "寿喜烧",
    "麻辣烫",
  ]);
  vi.stubEnv("DATABASE_URL", "");
  menuMock.mockResolvedValue({ id: "missing-test", items });
  expect((await readShoppingList("2090-01-01")).missing).toEqual([
    "咖喱牛肉",
    "寿喜烧",
    "麻辣烫",
  ]);
  menuMock.mockResolvedValue({ id: "filled-test", items: realDishes });
  expect((await readShoppingList("2090-01-01")).missing).toEqual([]);
  menuMock.mockResolvedValue(null);
  expect(await readShoppingList("2090-01-01")).toMatchObject({
    missing: [],
    menuEmpty: true,
  });
});
