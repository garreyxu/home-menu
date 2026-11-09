import { expect, type Page } from "@playwright/test";

export type WallDish = {
  name: string;
  category: string;
};

const EMPTY_WALL = "菜品墙是空的，端到端测试需要至少一道菜。";

/** Dish cards on the wall. Fails immediately when the wall has no dishes. */
export async function readWall(page: Page): Promise<WallDish[]> {
  const cards = page.locator("ul.dish-grid").getByRole("listitem");
  await expect(cards, EMPTY_WALL).not.toHaveCount(0);
  const count = await cards.count();

  const dishes: WallDish[] = [];
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    const name = (
      await card.getByRole("heading", { level: 3 }).innerText()
    ).trim();
    const category = (await card.getAttribute("data-category"))?.trim() ?? "";
    expect(await card.locator("p.dish-category").count()).toBe(0);
    expect(name, "菜品卡片没有菜名").not.toBe("");
    expect(category, `${name} 没有分类`).not.toBe("");
    dishes.push({ name, category });
  }

  const names = dishes.map((dish) => dish.name);
  expect(new Set(names).size, "菜品墙上的菜名必须唯一").toBe(names.length);
  return dishes;
}

/** Short names first, so the week-board width check is about layout, not a long title. */
export function shortestDishes(
  dishes: readonly WallDish[],
  count: number,
): WallDish[] {
  expect(
    dishes.length,
    `端到端测试需要至少 ${count} 道菜。`,
  ).toBeGreaterThanOrEqual(count);
  return [...dishes]
    .sort(
      (a, b) =>
        a.name.length - b.name.length || a.name.localeCompare(b.name, "zh-CN"),
    )
    .slice(0, count);
}
