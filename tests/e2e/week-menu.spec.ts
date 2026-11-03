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
});

async function addToSlot(page: Page, slotName: string) {
  const card = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "番茄炒蛋", level: 3 }) });
  await card.getByRole("button", { name: "+加到哪天" }).click();
  await page.getByRole("button", { name: slotName }).click();
}

async function removeIfVisible(page: Page, name: string) {
  const button = page.getByRole("button", { name });
  if ((await button.count()) === 0) return;
  await button.click();
  await expect(button).toHaveCount(0);
}
