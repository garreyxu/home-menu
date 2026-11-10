import { test, expect } from "./fixtures";

import { e2eCredentials, login } from "./credentials";

const credentials = e2eCredentials();

test.describe("in-site recipe", () => {
  test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");

  test("localizes seeded recipe body text in the sheet", async ({
    page,
    world,
  }) => {
    const dish = world.dishes.find((dish) => dish.hasRecipe)!;
    test.skip(
      dish.id.startsWith("sample-dish:"),
      "Requires database-backed /api/e2e dishes",
    );
    expect(Number(world.weeks[0].slice(0, 4))).toBeGreaterThanOrEqual(2090);
    await login(page, credentials!.username, credentials!.password);
    await page.locator(`[data-recipe-for="${dish.id}"]`).click();
    const body = page
      .getByRole("dialog", { name: dish.name })
      .locator(".recipe-body");
    await expect(body).toContainText("准备10 分钟，炖60 分钟");
    await expect(body).toContainText("酱豆腐1勺（可选）");
    await expect(body).toContainText("焖5 分钟，加盐（可选）");
    await expect(body).not.toContainText(/min|option/i);
  });

  test("opens a recipe in the site and does not link to Notion", async ({
    page,
    world,
  }) => {
    const { username, password } = credentials!;
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, username, password);

    const dish = world.dishes.find((dish) => dish.hasRecipe)!;
    const card = page.locator("ul.dish-grid > li").filter({
      has: page.locator(`[data-recipe-for="${dish.id}"]`),
    });

    await card
      .getByRole("button", {
        name: `查看${dish.name}的做法`,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: dish.name,
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
      await expect(dialog.getByText("这道菜还没写做法")).toHaveCount(0);
    } else if (text.includes("这道菜还没写做法")) {
      await expect(dialog.getByText("这道菜还没写做法")).toBeVisible();
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
