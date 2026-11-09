import { describe, expect, it } from "vitest";

import { seedCategories, seedDishes } from "@/server/db/seed-data";

describe("seed catalog", () => {
  it("has four categories and twelve dishes with no photos", () => {
    expect(seedCategories).toHaveLength(4);
    expect(seedDishes).toHaveLength(12);
    expect(new Set(seedCategories.map((category) => category.name)).size).toBe(
      4,
    );
    expect(new Set(seedDishes.map((dish) => dish.name)).size).toBe(12);

    const categoryNames = new Set(
      seedCategories.map((category) => category.name),
    );
    for (const dish of seedDishes) {
      expect(categoryNames.has(dish.categoryName)).toBe(true);
      expect(dish.description.length).toBeGreaterThan(0);
      expect("photoKey" in dish).toBe(false);
    }

    const withRecipe = seedDishes.filter(
      (dish) => dish.recipeBlocks && dish.recipeBlocks.length > 0,
    );
    expect(withRecipe.map((dish) => dish.name)).toEqual(["番茄炒蛋"]);
    expect(JSON.stringify(withRecipe)).not.toContain("notion.so");
    expect(JSON.stringify(withRecipe)).toContain("鸡蛋打散");
  });
});
