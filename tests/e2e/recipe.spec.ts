import { test, expect } from "./fixtures";

import { e2eCredentials, login } from "./credentials";

const credentials = e2eCredentials();

test.describe("in-site recipe", () => {
  test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");

  test("opens a recipe in the site and does not link to Notion", async ({
    page,
    world,
  }) => {
    const { username, password } = credentials!;
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, username, password);

    const card = page
      .locator("ul.dish-grid")
      .getByRole("listitem")
      .filter({
        has: page.getByRole("heading", {
          name: world.dishes.find((dish) => dish.hasRecipe)!.name,
          exact: true,
        }),
      });

    await card
      .getByRole("button", {
        name: `查看${world.dishes.find((dish) => dish.hasRecipe)!.name}的做法`,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: world.dishes.find((dish) => dish.hasRecipe)!.name,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("正在打开做法")).toHaveCount(0);

    const phoneBox = await dialog.boundingBox();
    expect(phoneBox).not.toBeNull();
    expect(phoneBox!.height).toBeGreaterThan(700);
    expect(phoneBox!.y).toBeLessThanOrEqual(2);

    const text = await dialog.innerText();
    expect(text).not.toContain("notion.so");
    await expect(dialog.locator("a")).toHaveCount(0);

    if (text.includes("鸡蛋打散")) {
      await expect(dialog.getByText("鸡蛋打散")).toBeVisible();
      await expect(dialog.getByText("暂无做法")).toHaveCount(0);
    } else if (text.includes("暂无做法")) {
      await expect(dialog.getByText("暂无做法")).toBeVisible();
    } else {
      await expect(dialog.locator(".recipe-body")).not.toHaveText("");
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    const desktopBox = await dialog.boundingBox();
    expect(desktopBox).not.toBeNull();
    expect(desktopBox!.width).toBeLessThan(700);
    expect(desktopBox!.height).toBeLessThan(700);
    expect(desktopBox!.y).toBeGreaterThan(8);

    await dialog.getByRole("button", { name: "关闭" }).click();
    await expect(dialog).toHaveCount(0);
  });
});
