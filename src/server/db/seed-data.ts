import type { RecipeBlock } from "@/lib/recipe-blocks";

export type SeedCategory = {
  name: string;
  sortOrder: number;
};

export type SeedDish = {
  name: string;
  categoryName: string;
  description: string;
  recipeBlocks?: RecipeBlock[];
  ingredients?: string;
};

const tomatoEggRecipe: RecipeBlock[] = [
  { type: "heading", level: 2, spans: [{ text: "食材" }] },
  {
    type: "bulleted_list_item",
    spans: [{ text: "鸡蛋", bold: true }, { text: " 2 个" }],
    children: [],
  },
  {
    type: "bulleted_list_item",
    spans: [{ text: "番茄" }],
    children: [
      {
        type: "bulleted_list_item",
        spans: [{ text: "切块" }],
        children: [],
      },
    ],
  },
  { type: "heading", level: 2, spans: [{ text: "步骤" }] },
  {
    type: "numbered_list_item",
    spans: [{ text: "鸡蛋打散" }],
    children: [],
  },
  {
    type: "numbered_list_item",
    spans: [{ text: "番茄炒出汁", italic: true }],
    children: [],
  },
  {
    type: "to_do",
    spans: [{ text: "撒葱花" }],
    checked: false,
    children: [],
  },
  { type: "divider" },
  { type: "quote", spans: [{ text: "酸甜就好" }] },
  { type: "callout", spans: [{ text: "中火" }] },
];

export const seedCategories: readonly SeedCategory[] = [
  { name: "家常菜", sortOrder: 0 },
  { name: "汤品", sortOrder: 1 },
  { name: "主食", sortOrder: 2 },
  { name: "凉菜", sortOrder: 3 },
];

export const seedDishes: readonly SeedDish[] = [
  {
    name: "番茄炒蛋",
    ingredients: "番茄，鸡蛋，葱（optional），盐，糖",
    categoryName: "家常菜",
    description: "番茄和鸡蛋一起炒，酸甜家常。",
    recipeBlocks: tomatoEggRecipe,
  },
  {
    name: "红烧肉",
    ingredients: "五花肉，鸡蛋，八角，生抽，老抽，糖",
    categoryName: "家常菜",
    description: "五花肉慢炖，酱香软烂。",
  },
  {
    name: "宫保鸡丁",
    categoryName: "家常菜",
    description: "鸡丁配花生，微辣。",
  },
  {
    name: "麻婆豆腐",
    categoryName: "家常菜",
    description: "豆腐配肉末，麻辣。",
  },
  {
    name: "鱼香肉丝",
    categoryName: "家常菜",
    description: "猪肉丝配笋丝，鱼香味。",
  },
  {
    name: "清炒西兰花",
    categoryName: "家常菜",
    description: "西兰花清炒，少油。",
  },
  {
    name: "紫菜蛋花汤",
    categoryName: "汤品",
    description: "紫菜和蛋花的清汤。",
  },
  {
    name: "番茄蛋汤",
    categoryName: "汤品",
    description: "番茄打底的蛋汤。",
  },
  {
    name: "米饭",
    categoryName: "主食",
    description: "白米饭。",
  },
  {
    name: "馒头",
    categoryName: "主食",
    description: "白面馒头。",
  },
  {
    name: "拍黄瓜",
    categoryName: "凉菜",
    description: "黄瓜拍碎，蒜香。",
  },
  {
    name: "凉拌木耳",
    categoryName: "凉菜",
    description: "木耳凉拌，清爽。",
  },
];
