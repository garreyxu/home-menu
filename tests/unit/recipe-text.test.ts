import type { RecipeSpan } from "@/lib/recipe-blocks";
import { describe, expect, it } from "vitest";
import { normalizeRecipeSpans, normalizeRecipeText } from "@/lib/recipe-text";

describe("normalizeRecipeText", () => {
  it("normalizes split rich text while retaining styles and source data", () => {
    const spans: RecipeSpan[] = [
      { text: "炖10 ", bold: true },
      { text: "min，加盐（op", italic: true },
      { text: "tional），再焖5mins" },
    ];
    const original = JSON.stringify(spans);
    const normalized = normalizeRecipeSpans(spans);
    expect(normalized.map((span) => span.text).join("")).toBe(
      "炖10 分钟，加盐（可选），再焖5 分钟",
    );
    expect(normalized[0]).toEqual({ text: "炖10 分钟", bold: true });
    expect(normalized[1].italic).toBe(true);
    expect(JSON.stringify(spans)).toBe(original);
  });

  it.each([
    ["10 min", "10 分钟"],
    ["60 min", "60 分钟"],
    ["酱豆腐1勺(option)", "酱豆腐1勺（可选）"],
    ["煮5 mins后焖10MIN，再炖1 Hr。", "煮5 分钟后焖10 分钟，再炖1 小时。"],
    ["1minute 2minutes 3min 4mins", "1 分钟 2 分钟 3 分钟 4 分钟"],
    ["1hr 2hrs 3hour 4HOURS", "1 小时 2 小时 3 小时 4 小时"],
    [
      "盐（OPTION） 葱(optional) 糖（Optional）",
      "盐（可选） 葱（可选） 糖（可选）",
    ],
    [
      "mint, minced garlic, admin, 5 mint, 5 minced garlic",
      "mint, minced garlic, admin, 5 mint, 5 minced garlic",
    ],
    [
      "min mins minute minutes hr hrs hour hours option",
      "min mins minute minutes hr hrs hour hours option",
    ],
    ["炖10 分钟（可选）", "炖10 分钟（可选）"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeRecipeText(input)).toBe(expected);
    expect(normalizeRecipeText(expected)).toBe(expected);
  });
});
