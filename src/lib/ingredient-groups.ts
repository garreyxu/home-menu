export const INGREDIENT_GROUPS = [
  "肉",
  "海鲜",
  "蔬菜菌菇",
  "豆蛋",
  "主食面粉",
  "调料干货",
  "其他",
] as const;
export type IngredientGroup = (typeof INGREDIENT_GROUPS)[number];

// To extend keyword matching, add a word here.
export const GROUP_WORDS: Record<IngredientGroup, readonly string[]> = {
  肉: [
    "鸡腿",
    "鸡胸肉",
    "鸡肉",
    "鸡翅",
    "牛肉",
    "牛腩",
    "猪肉",
    "五花肉",
    "排骨",
    "肉末",
    "猪肉丝",
    "羊肉",
    "培根",
    "肥牛",
    "肥羊",
    "牛腱",
    "牛排",
    "牛柳",
    "羊腿",
    "羊通脊",
    "羊外脊",
    "羊棒骨",
    "小排",
    "猪脚",
    "牛肉末",
    "五花",
    "午餐肉",
    "腊肠",
    "脆肠",
    "鸡爪",
    "三黄鸡",
    "鸡",
  ],
  海鲜: [
    "虾",
    "虾仁",
    "鱼",
    "鱼片",
    "三文鱼",
    "鳕鱼",
    "带鱼",
    "蛤蜊",
    "鱿鱼",
    "扇贝",
    "蟹",
    "龙利鱼",
    "蟹肉棒",
  ],
  蔬菜菌菇: [
    "番茄",
    "西红柿",
    "大葱",
    "葱",
    "小葱",
    "葱花",
    "姜",
    "生姜",
    "蒜",
    "大蒜",
    "洋葱",
    "土豆",
    "胡萝卜",
    "黄瓜",
    "西兰花",
    "青椒",
    "白菜",
    "菠菜",
    "生菜",
    "香菜",
    "香菇",
    "蘑菇",
    "金针菇",
    "木耳",
    "笋",
    "甜椒",
    "辣椒",
    "小米椒",
    "小米辣",
    "菜心",
    "娃娃菜",
    "茼蒿",
    "萝卜",
    "竹笋",
    "玉米",
    "红薯",
    "西芹",
    "菇",
    "青豆",
    "九层塔",
    "大蒜叶",
  ],
  豆蛋: ["鸡蛋", "鸭蛋", "豆腐", "豆干", "豆皮", "腐竹", "豆酥", "蛋"],
  主食面粉: [
    "大米",
    "米饭",
    "面条",
    "面粉",
    "糯米",
    "饺子皮",
    "年糕",
    "意面",
    "米",
    "饭",
    "面",
    "粉丝",
    "土豆粉",
    "魔芋丝",
    "油条",
    "鸡蛋面",
  ],
  调料干货: [
    "八角",
    "桂皮",
    "香叶",
    "干辣椒",
    "花椒",
    "花生",
    "芝麻",
    "紫菜",
    "海带",
    "豆瓣酱",
    "大料",
    "辣椒面",
    "孜然",
    "豆豉",
    "红枣",
    "山楂",
    "咖喱块",
    "麻酱",
    "老干妈",
    "寿喜烧汁",
    "蒸鱼豉油",
    "番茄酱",
    "蜂蜜",
    "黄油",
    "奶油",
    "白酒",
    "米酒",
    "啤酒",
    "香料包",
  ],
  其他: [],
};
// Explicit whole-name exceptions after normalization; add a word here.
export const GROUP_EXCEPTIONS: { name: string; group: IngredientGroup }[] = [
  { name: "鱼豆腐", group: "豆蛋" },
  { name: "土豆粉", group: "主食面粉" },
  { name: "番茄酱", group: "调料干货" },
  { name: "辣椒面", group: "调料干货" },
  { name: "干辣椒", group: "调料干货" },
];

/** Matching only: display names and deduplication keys stay unchanged. */
export function normalizeIngredientName(name: string): string {
  let normalized = name;
  let previous;
  do {
    previous = normalized;
    normalized = normalized.replace(/\([^()]*\)|（[^（）]*）/g, "");
  } while (normalized !== previous);
  return normalized.trim();
}

// Common staples only appear under 家里常备; add a word here.
export const PANTRY_WORDS = [
  "生抽",
  "老抽",
  "蚝油",
  "盐",
  "糖",
  "白糖",
  "冰糖",
  "黄冰糖",
  "醋",
  "米醋",
  "陈醋",
  "浙红醋",
  "料酒",
  "淀粉",
  "玉米淀粉",
  "酱油",
  "食用油",
  "油",
  "香油",
  "芝麻油",
  "胡椒粉",
  "白胡椒粉",
  "黑胡椒",
  "鸡精",
];
export const PANTRY = new Set(PANTRY_WORDS);
export function isPantryIngredient(name: string): boolean {
  return PANTRY.has(normalizeIngredientName(name));
}
export function ingredientGroup(name: string): IngredientGroup {
  const normalized = normalizeIngredientName(name);
  const exception = GROUP_EXCEPTIONS.find((entry) => entry.name === normalized);
  if (exception) return exception.group;
  let match: IngredientGroup = "其他";
  let length = 0;
  // Strictly longer wins; equal lengths retain the spec's group order.
  for (const group of INGREDIENT_GROUPS) {
    for (const keyword of GROUP_WORDS[group]) {
      if (keyword.length > length && normalized.includes(keyword)) {
        match = group;
        length = keyword.length;
      }
    }
  }
  return match;
}
