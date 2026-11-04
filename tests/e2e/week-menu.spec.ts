import { expect, test, type Page } from "@playwright/test";
import { e2eCredentials, login } from "./credentials";

const credentials = e2eCredentials();
const week = "2026-12-27";

test.describe("weekly menu", () => {
  test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90_000);

  test("adds Tuesday dinner, keeps it after reload, then removes it", async ({
    page,
  }) => {
    const { username, password } = credentials!;
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, username, password);
    await page.goto(`/?week=${week}`);

    const board = page.getByRole("region", { name: "一周菜单" });
    await expect(board).toBeVisible();
    await expect(board.getByText("12月27日–1月2日")).toBeVisible();

    try {
      await addToSlot(page, "周二晚餐");
      await expect(board.getByText("番茄炒蛋")).toBeVisible();
      await expect(page.getByRole("status")).toContainText("已加到 周二·晚");

      await page.reload();
      await expect(board.getByText("番茄炒蛋")).toBeVisible();

      await page
        .getByRole("button", { name: "从周二晚餐移除番茄炒蛋" })
        .click();
      await expect(board.getByText("番茄炒蛋")).toHaveCount(0);
      await page.reload();
      await expect(board.getByText("番茄炒蛋")).toHaveCount(0);
    } finally {
      await removeIfVisible(page, "从周二晚餐移除番茄炒蛋");
    }
  });

  test("opens the week board in a drawer between 1024 and 1439", async ({
    page,
  }) => {
    const { username, password } = credentials!;
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, username, password);
    await page.goto(`/?week=${week}`);

    await expect(page.getByRole("region", { name: "一周菜单" })).toHaveCount(0);
    await page.getByRole("button", { name: /^本周 \d+$/ }).click();
    const drawer = page.getByRole("dialog", { name: "一周菜单" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText("12月27日–1月2日")).toBeVisible();
    const box = await drawer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(360);
    expect(box!.width).toBeLessThanOrEqual(384);
  });

  test("mobile tray shows the count and the dish after adding", async ({
    page,
  }) => {
    const { username, password } = credentials!;
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, username, password);
    await page.goto(`/?week=${week}`);

    const tray = page.getByRole("button", { name: /本周已点 \d+ 道/ });
    await expect(tray).toBeVisible();
    await expect(tray).toHaveText("本周已点 0 道");

    try {
      await addToSlot(page, "周三午餐");
      const cell = page.getByRole("button", { name: "周三午餐" });
      const box = await cell.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await page.keyboard.press("Escape");

      await expect(tray).toHaveText("本周已点 1 道");
      await tray.click();
      const board = page.getByRole("region", { name: "一周菜单" });
      await expect(board.getByText("番茄炒蛋")).toBeVisible();

      await page.reload();
      await expect(tray).toHaveText("本周已点 1 道");
      await tray.click();
      await expect(board.getByText("番茄炒蛋")).toBeVisible();

      await page
        .getByRole("button", { name: "从周三午餐移除番茄炒蛋" })
        .click();
      await expect(board.getByText("番茄炒蛋")).toHaveCount(0);
    } finally {
      const tray = page.getByRole("button", { name: /本周已点 \d+ 道/ });
      if ((await tray.getAttribute("aria-expanded")) !== "true") {
        await tray.click();
      }
      await removeIfVisible(page, "从周三午餐移除番茄炒蛋");
    }
  });

  test("keeps dish names readable on the persistent board", async ({
    page,
  }) => {
    const { username, password } = credentials!;
    const planned = [
      { dish: "番茄炒蛋", slot: "周一早餐", remove: "从周一早餐移除番茄炒蛋" },
      { dish: "红烧肉", slot: "周三午餐", remove: "从周三午餐移除红烧肉" },
      { dish: "宫保鸡丁", slot: "周五晚餐", remove: "从周五晚餐移除宫保鸡丁" },
    ] as const;

    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, username, password);
    await page.goto(`/?week=${week}`);

    try {
      for (const item of planned) {
        await addDish(page, item.dish, item.slot);
        await page.keyboard.press("Escape");
      }

      for (const width of [1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        const board = page.getByRole("region", { name: "一周菜单" });
        await expect(board).toBeVisible();
        await expect(board.getByRole("button", { name: "空着呢" })).toHaveCount(
          0,
        );
        const empty = board.locator(".week-slot-empty").first();
        await expect(empty).toBeVisible();
        expect(await empty.getAttribute("role")).not.toBe("button");
        expect(await empty.evaluate((node) => node.tabIndex)).toBeLessThan(0);

        for (const item of planned) {
          const name = board.locator(".week-dish-name", { hasText: item.dish });
          await expect(name).toHaveCount(1);
          await expect(name).toHaveAttribute("title", item.dish);
          await expect(name).toHaveAccessibleName(item.dish);
          const fit = await name.evaluate((node) => {
            const style = getComputedStyle(node);
            const fontSize = Number.parseFloat(style.fontSize);
            const text = node.textContent ?? "";
            return {
              // A CJK glyph is about one em wide. The old layout fit one glyph
              // plus an ellipsis (about 25px at 14px).
              chars: Math.floor((node.clientWidth + 1) / fontSize),
              text,
              clientWidth: node.clientWidth,
              scrollWidth: node.scrollWidth,
              singleGlyph: /^.\u2026$|^.\.\.\.$/.test(text),
            };
          });
          expect(fit.text).toBe(item.dish);
          expect(fit.singleGlyph).toBe(false);
          expect(fit.chars).toBeGreaterThanOrEqual(2);
          expect(fit.clientWidth).toBeGreaterThan(0);
          expect(fit.scrollWidth / fit.clientWidth).toBeLessThan(1.35);

          const nameBox = await name.boundingBox();
          const removeBox = await board
            .getByRole("button", { name: item.remove })
            .boundingBox();
          expect(nameBox).not.toBeNull();
          expect(removeBox).not.toBeNull();
          const separated =
            removeBox!.x + removeBox!.width <= nameBox!.x + 1 ||
            nameBox!.x + nameBox!.width <= removeBox!.x + 1 ||
            removeBox!.y + removeBox!.height <= nameBox!.y + 1 ||
            nameBox!.y + nameBox!.height <= removeBox!.y + 1;
          expect(separated).toBe(true);
        }
      }
    } finally {
      const board = page.getByRole("region", { name: "一周菜单" });
      if ((await board.count()) === 0) {
        await page.setViewportSize({ width: 1440, height: 900 });
      }
      for (const item of planned) {
        await removeIfVisible(page, item.remove);
      }
    }
  });

  test("opens the week board from one control at each breakpoint", async ({
    page,
  }) => {
    const { username, password } = credentials!;
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, username, password);
    await page.goto(`/?week=${week}`);

    const tray = page.locator(".week-tray-toggle");
    const drawer = page.locator(".week-drawer-toggle");

    await expect(tray).toBeHidden();
    await expect(drawer).toBeVisible();
    await expect(page.getByRole("region", { name: "一周菜单" })).toHaveCount(0);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(tray).toBeHidden();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("region", { name: "一周菜单" })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(tray).toBeVisible();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("region", { name: "一周菜单" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /本周已点 \d+ 道/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^本周 \d+$/ })).toHaveCount(
      0,
    );
  });
});

async function addDish(page: Page, dishName: string, slotName: string) {
  const card = page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: dishName, level: 3 }),
  });
  await card.getByRole("button", { name: "+加到哪天" }).click();
  await page.getByRole("button", { name: slotName }).click();
}

async function addToSlot(page: Page, slotName: string) {
  await addDish(page, "番茄炒蛋", slotName);
}

async function removeIfVisible(page: Page, name: string) {
  const button = page.getByRole("button", { name });
  if ((await button.count()) === 0) return;
  await button.click();
  await expect(button).toHaveCount(0);
}
