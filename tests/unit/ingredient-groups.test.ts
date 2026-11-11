import { expect, it } from "vitest";
import {
  ingredientGroup,
  isPantryIngredient,
  normalizeIngredientName,
  INGREDIENT_GROUPS,
} from "@/lib/ingredient-groups";

it.each([
  ["嫩豆腐", "豆蛋"],
  ["老豆腐", "豆蛋"],
  ["油豆腐", "豆蛋"],
  ["鱼豆腐", "豆蛋"],
  ["蟹肉棒", "海鲜"],
  ["大虾", "海鲜"],
  ["龙利鱼", "海鲜"],
  ["鳕鱼(或比目鱼)", "海鲜"],
  ["肥牛", "肉"],
  ["羊通脊", "肉"],
  ["牛腱或牛腩", "肉"],
  ["皱皮青椒", "蔬菜菌菇"],
  ["白洋葱", "蔬菜菌菇"],
  ["红黄甜椒", "蔬菜菌菇"],
  ["海鲜菇", "蔬菜菌菇"],
  ["粉丝", "主食面粉"],
  ["土豆粉", "主食面粉"],
  ["鸡蛋面", "主食面粉"],
  ["番茄酱", "调料干货"],
  ["辣椒面", "调料干货"],
  ["干辣椒", "调料干货"],
  ["花生米", "调料干货"],
  ["高度白酒", "调料干货"],
  ["神秘食材", "其他"],
  ["", "其他"],
])("groups %s as %s", (name, group) =>
  expect(ingredientGroup(name)).toBe(group),
);

it("strips parenthetical alternatives only for matching, including nested ones", () => {
  expect(normalizeIngredientName(" 鳕鱼（或比目鱼(切片)） ")).toBe("鳕鱼");
  expect(ingredientGroup("虾(或者午餐肉)")).toBe("海鲜");
  expect(ingredientGroup("鱼豆腐（或虾）")).toBe("豆蛋");
});
it("uses group order for equal keyword lengths", () => {
  expect(ingredientGroup("鸡鱼")).toBe("肉");
  expect(INGREDIENT_GROUPS).toEqual([
    "肉",
    "海鲜",
    "蔬菜菌菇",
    "豆蛋",
    "主食面粉",
    "调料干货",
    "其他",
  ]);
});
it("matches pantry exactly after normalization, without swallowing shopped sauces or fats", () => {
  for (const name of "生抽 老抽 蚝油 盐 糖 白糖 冰糖 黄冰糖 醋 陈醋 米醋 浙红醋 料酒 淀粉 酱油 食用油 油 香油 胡椒粉 黑胡椒 鸡精".split(
    " ",
  )) {
    expect(isPantryIngredient(name)).toBe(true);
    expect(isPantryIngredient(`${name}（或其他牌子）`)).toBe(true);
  }
  for (const name of ["番茄酱", "黄油", "蜂蜜", "油豆腐", "花生米", "蒸鱼豉油"])
    expect(isPantryIngredient(name)).toBe(false);
});
