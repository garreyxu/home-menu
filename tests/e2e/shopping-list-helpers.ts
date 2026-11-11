import { expect, type Page } from "@playwright/test";
import { persistMenuAction, type World } from "./fixtures";

export const shoppingBoard = (page: Page) =>
  page.locator(
    ".week-panel:visible, .week-drawer-panel:visible, #week-tray-panel:visible",
  );
export async function showShoppingBoard(page: Page) {
  if (page.viewportSize()!.width < 1024) {
    const tray = page.getByRole("button", { name: /本周已点 \d+ 道/ });
    if ((await tray.getAttribute("aria-expanded")) !== "true")
      await tray.click();
  } else if (page.viewportSize()!.width < 1440) {
    const toggle = page.getByRole("button", { name: /^本周 \d+$/ });
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await toggle.click();
  }
}
export async function addShoppingDish(
  page: Page,
  world: World,
  week: string,
  name: string,
) {
  expect(Number(week.slice(0, 4))).toBeGreaterThanOrEqual(2090);
  const dish = world.dishes.find((dish) => dish.name === name)!;
  expect(dish).toBeDefined();
  await page.goto(
    `/?week=${week}&category=${encodeURIComponent(dish.category)}`,
  );
  await showShoppingBoard(page);
  const card = page
    .locator(".dish-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await card.getByRole("button", { name: /^(＋添加|已加 \d+ 次)$/ }).click();
  await persistMenuAction(page, () =>
    shoppingBoard(page)
      .getByRole("button", { name: "周二晚餐", exact: true })
      .click(),
  );
  await page.keyboard.press("Escape");
}
export async function openShoppingList(page: Page) {
  await showShoppingBoard(page);
  await shoppingBoard(page)
    .getByRole("button", { name: "买菜单", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "买菜单", exact: true });
  await expect(dialog.getByRole("checkbox").first()).toBeVisible();
  return dialog;
}
