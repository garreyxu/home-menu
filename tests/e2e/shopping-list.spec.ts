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
  await persistMenuAction(page, () => egg.check());
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
