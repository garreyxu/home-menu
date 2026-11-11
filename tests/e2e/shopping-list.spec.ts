import {
  test,
  expect,
  persistMenuAction,
  cleanupWorldAfterEach,
} from "./fixtures";
import { e2eCredentials, login } from "./credentials";
import {
  addShoppingDish,
  openShoppingList,
  shoppingBoard,
} from "./shopping-list-helpers";

cleanupWorldAfterEach();
test("shopping checks are shared, week-isolated, and survive removing and re-adding dishes", async ({
  page,
  browser,
  world,
}, info) => {
  test.setTimeout(120_000);
  const credentials = e2eCredentials()!;
  const [weekA, weekB] = world.weeks;
  expect(weekA).not.toBe(weekB);
  for (const week of [weekA, weekB])
    expect(Number(week.slice(0, 4))).toBeGreaterThanOrEqual(2090);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, credentials.username, credentials.password);
  await addShoppingDish(page, world, weekA, "番茄炒蛋");
  await addShoppingDish(page, world, weekA, "红烧肉");
  let list = await openShoppingList(page);
  await expect(list.locator(".shopping-group h3")).toHaveText([
    "肉",
    "蔬菜菌菇",
    "豆蛋",
    "调料干货",
  ]);
  const egg = list.getByRole("checkbox", { name: /^鸡蛋，/ });
  await expect(egg).toHaveCount(1);
  await expect(egg).toHaveAttribute(
    "aria-label",
    "鸡蛋，番茄炒蛋、红烧肉要用，未买",
  );
  await expect(list.getByText("（可选）", { exact: true })).toBeVisible();
  const pantry = list.getByRole("button", { name: /^家里常备/ });
  await expect(pantry).toHaveAttribute("aria-expanded", "false");
  await pantry.click();
  await expect(list.getByRole("checkbox", { name: /^盐，/ })).toBeVisible();
  await pantry.click();
  const names = list.locator(".shopping-group .shopping-name");
  const originalOrder = await names.allTextContents();
  const eggName = egg.locator("..").locator(".shopping-name");
  const originalPosition = await eggName.boundingBox();
  await persistMenuAction(page, () => egg.check());
  await expect(eggName).toHaveCSS("text-decoration-line", "line-through");
  await expect(eggName).toHaveCSS("animation-duration", "0.18s");
  await expect(eggName).toHaveCSS("text-decoration-color", "rgb(28, 22, 19)");
  await expect(names).toHaveText(originalOrder);
  expect(await eggName.boundingBox()).toEqual(originalPosition);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(eggName).toHaveCSS("animation-name", "none");
  await expect(eggName).toHaveCSS("text-decoration-line", "line-through");
  await expect(eggName).toHaveCSS("text-decoration-color", "rgb(28, 22, 19)");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await persistMenuAction(page, () =>
    list.getByRole("checkbox", { name: /^番茄，/ }).check(),
  );
  const second = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    baseURL: info.project.use.baseURL,
    extraHTTPHeaders: info.project.use.extraHTTPHeaders,
  });
  try {
    const other = await second.newPage();
    await login(other, credentials.username, credentials.password);
    await other.goto(`/?week=${weekA}`);
    const shared = await openShoppingList(other);
    await expect(
      shared.getByRole("checkbox", { name: /^鸡蛋，/ }),
    ).toBeChecked();
    await expect(
      shared.getByRole("checkbox", { name: /^番茄，/ }),
    ).toBeChecked();
    await persistMenuAction(other, () =>
      shared.getByRole("checkbox", { name: /^五花肉，/ }).check(),
    );
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      list.getByRole("checkbox", { name: /^五花肉，/ }),
    ).toBeChecked();
    await shared.getByRole("button", { name: "关闭买菜单" }).click();
    await addShoppingDish(other, world, weekB, "番茄炒蛋");
    const isolated = await openShoppingList(other);
    await expect(
      isolated.getByRole("checkbox", { name: /^鸡蛋，/ }),
    ).not.toBeChecked();
    await expect(
      isolated.getByRole("checkbox", { name: /^番茄，/ }),
    ).not.toBeChecked();
  } finally {
    await second.close();
  }
  await list.getByRole("button", { name: "关闭买菜单" }).click();
  await persistMenuAction(page, () =>
    shoppingBoard(page)
      .getByRole("button", { name: "从周二晚餐移除番茄炒蛋", exact: true })
      .click(),
  );
  list = await openShoppingList(page);
  await expect(list.getByRole("checkbox", { name: /^番茄，/ })).toHaveCount(0);
  await expect(list.getByRole("checkbox", { name: /^鸡蛋，/ })).toBeChecked();
  await list.getByRole("button", { name: "关闭买菜单" }).click();
  await addShoppingDish(page, world, weekA, "番茄炒蛋");
  list = await openShoppingList(page);
  await expect(list.getByRole("checkbox", { name: /^番茄，/ })).toBeChecked();
  await expect(list.getByRole("checkbox", { name: /^鸡蛋，/ })).toBeChecked();
  await list.getByRole("button", { name: "清空勾选", exact: true }).click();
  await expect(list.getByText("把这周的勾都去掉？")).toBeVisible();
  await list.getByRole("button", { name: "取消", exact: true }).click();
  await expect(list.getByRole("checkbox", { name: /^鸡蛋，/ })).toBeChecked();
  await list.getByRole("button", { name: "清空勾选", exact: true }).click();
  await persistMenuAction(page, () =>
    list.getByRole("button", { name: "确认清空" }).click(),
  );
  await expect(
    list.getByRole("checkbox", { name: /^鸡蛋，/ }),
  ).not.toBeChecked();
});

test("shopping failures show retry and roll back optimistic checks", async ({
  page,
  world,
}) => {
  const credentials = e2eCredentials()!;
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, credentials.username, credentials.password);
  await addShoppingDish(page, world, world.weeks[0], "番茄炒蛋");
  const failActions = async (route: import("@playwright/test").Route) => {
    if (route.request().headers()["next-action"]) await route.abort("failed");
    else await route.continue();
  };
  await page.route("**/*", failActions);
  await shoppingBoard(page)
    .getByRole("button", { name: "买菜单", exact: true })
    .click();
  const list = page.getByRole("dialog", { name: "买菜单", exact: true });
  await expect(list.getByText("清单没拿到，再试一次")).toBeVisible();
  await page.unroute("**/*", failActions);
  await list.getByRole("button", { name: "重试", exact: true }).click();
  const egg = list.getByRole("checkbox", { name: /^鸡蛋，/ });
  await expect(egg).toBeVisible();
  await page.route("**/*", failActions);
  await egg.click();
  await expect(
    list.getByRole("status").filter({ hasText: "没能保存勾选，再试一次" }),
  ).toBeVisible();
  await expect(egg).not.toBeChecked();
  await page.unroute("**/*", failActions);
  await persistMenuAction(page, () => egg.check());
  await expect(egg).toHaveAttribute("aria-disabled", "false");
  await persistMenuAction(page, () => egg.uncheck());
  await expect(egg).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(list).not.toBeVisible();
  await expect(
    shoppingBoard(page).getByRole("button", { name: "买菜单", exact: true }),
  ).toBeFocused();
});

test("missing ingredient properties remain visible without overflowing the shopping sheet", async ({
  page,
  world,
}) => {
  test.setTimeout(90_000);
  const credentials = e2eCredentials()!;
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, credentials.username, credentials.password);
  await addShoppingDish(page, world, world.weeks[0], "番茄炒蛋");
  await addShoppingDish(page, world, world.weeks[0], "宫保鸡丁");
  for (const width of [390, 1440, 3440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    const list = await openShoppingList(page);
    const missing = list.getByText("这些菜还没有食材：宫保鸡丁", {
      exact: true,
    });
    await missing.scrollIntoViewIfNeeded();
    await expect(missing).toBeVisible();
    await expect(missing).toBeInViewport();
    expect(
      await list
        .locator(".shopping-paper")
        .evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await list.getByRole("button", { name: "关闭买菜单" }).click();
  }
});

test("checked names stay struck and stamps cover the centered box at every shopping width", async ({
  page,
  world,
}) => {
  test.setTimeout(90_000);
  const credentials = e2eCredentials()!;
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, credentials.username, credentials.password);
  await addShoppingDish(page, world, world.weeks[0], "番茄炒蛋");
  for (const width of [390, 1440, 3440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    const list = await openShoppingList(page);
    const checkbox = list.getByRole("checkbox", { name: /^鸡蛋，/ });
    const row = checkbox.locator("..");
    const name = row.locator(".shopping-name");
    await row.scrollIntoViewIfNeeded();
    const position = await row.boundingBox();
    await expect(name).not.toHaveCSS("text-decoration-line", /line-through/);
    await persistMenuAction(page, () => checkbox.check());
    await expect(name).toHaveCSS("text-decoration-line", /line-through/);
    await expect(name).toHaveCSS("text-decoration-color", "rgb(28, 22, 19)");
    await expect(checkbox).toHaveAttribute(
      "aria-label",
      "鸡蛋，番茄炒蛋要用，已买",
    );
    await row.evaluate(async (node) => {
      await Promise.all(
        node
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished),
      );
    });
    const box = await row.locator(".shopping-box").boundingBox();
    const stamp = await row.locator(".shopping-box > span").boundingBox();
    expect(
      Math.abs(box!.x + box!.width / 2 - (stamp!.x + stamp!.width / 2)),
    ).toBeLessThan(0.25);
    expect(
      Math.abs(box!.y + box!.height / 2 - (stamp!.y + stamp!.height / 2)),
    ).toBeLessThan(0.25);
    await expect(row.locator(".shopping-box")).toHaveCSS(
      "border-top-color",
      "rgba(0, 0, 0, 0)",
    );
    expect(await row.boundingBox()).toEqual(position);
    await persistMenuAction(page, () => checkbox.uncheck());
    await expect(name).not.toHaveCSS("text-decoration-line", /line-through/);
    await expect(checkbox).toHaveAttribute(
      "aria-label",
      "鸡蛋，番茄炒蛋要用，未买",
    );
    await list.getByRole("button", { name: "关闭买菜单" }).click();
  }
});
