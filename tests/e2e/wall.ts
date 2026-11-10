import { expect, type Page } from "@playwright/test";

export type WallDish = {
  id: string;
  name: string;
  category: string;
};

const EMPTY_WALL = "菜品墙是空的，端到端测试需要至少一道菜。";

/** Dish cards on the wall. Fails immediately when the wall has no dishes. */
export async function readWall(
  page: Page,
  owned: readonly WallDish[],
): Promise<WallDish[]> {
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
    const id = await card
      .locator("[data-recipe-for]")
      .getAttribute("data-recipe-for");
    expect(id).toBeTruthy();
    dishes.push({ id: id!, name, category });
  }

  // The catalog may contain duplicate family names; only fixture names are ours.
  const names = dishes
    .filter((dish) => owned.some((item) => item.id === dish.id))
    .map((dish) => dish.name);
  expect(new Set(names).size, "本轮测试菜名必须唯一").toBe(names.length);
  return dishes;
}
