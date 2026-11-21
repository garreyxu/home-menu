import { slotButton } from "./slots";
import {
  test,
  expect,
  persistMenuAction,
  cleanupWorldAfterEach,
} from "./fixtures";
import type { CDPSession, Locator, Page } from "@playwright/test";
import { HOLD_BEFORE_DRAG_MS } from "../../src/lib/week-chip-gesture";
import { e2eCredentials, login } from "./credentials";

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
cleanupWorldAfterEach();

const credentials = e2eCredentials();

test("hold release opens the recipe and hold drag reorders", async ({
  page,
  world,
}) => {
  test.skip(!credentials, "E2E credentials are not set");
  test.setTimeout(90_000);
  const dish = world.dishes.find((entry) => entry.hasRecipe) ?? world.dishes[0];
  expect(dish, "seeded dish").toBeTruthy();
  const name = dish!.name;
  await login(page, credentials!.username, credentials!.password);
  await page.goto(
    `/?week=${world.weeks[0]}&category=${encodeURIComponent(dish!.category)}`,
  );

  const board = page.locator("#week-tray-panel");
  const source = () => board.locator('[data-slot="1:lunch"]');
  const target = () => board.locator('[data-slot="1:dinner"]');
  const chip = () =>
    board.locator(".week-chip").filter({
      has: page.locator(".week-dish-name", { hasText: name }),
    });

  try {
    await addDish(page, name, "周一午餐");
    await openTray(page);
    await expect(source()).toContainText(name);

    await test.step("hold and release opens the recipe", async () => {
      const held = chip().first();
      await hold(page, held, async (session) => {
        await expect(held).toHaveClass(/is-held/);
        await session.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      });
      const dialog = page.getByRole("dialog", { name });
      await expect(dialog).toBeVisible();
      await expect(page.locator(".week-press-sheet")).toHaveCount(0);
      await expect(dialog.getByText("正在打开做法")).toHaveCount(0);
      await dialog.getByRole("button", { name: "关闭", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    });

    await test.step("hold and drag reorders without opening the recipe", async () => {
      const held = chip().first();
      await held.scrollIntoViewIfNeeded();
      const from = (await held.boundingBox())!;
      const to = (await target().boundingBox())!;
      const session = await page.context().newCDPSession(page);
      const start = {
        x: from.x + from.width / 2,
        y: from.y + from.height / 2,
        id: 1,
      };
      try {
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [start],
        });
        await expect(held).toHaveClass(/is-held/);
        await expect(page.locator(".recipe-panel")).toHaveCount(0);
        const steps = 8;
        for (let step = 1; step <= steps; step += 1) {
          const point = {
            x: start.x + ((to.x + to.width / 2 - start.x) * step) / steps,
            y: start.y + ((to.y + to.height / 2 - start.y) * step) / steps,
            id: 1,
          };
          await session.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [point],
          });
        }
        await expect(page.locator(".move-overlay")).toBeVisible();
        await expect(target().locator(".move-hint")).toBeVisible();
        await expect(page.locator(".recipe-panel")).toHaveCount(0);
        await session.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      } finally {
        await session.detach();
      }
      await expect(page.locator(".recipe-panel")).toHaveCount(0);
      await expect(page.locator(".week-press-sheet")).toHaveCount(0);
      await expect(page.locator(".move-overlay")).toHaveCount(0);
      await expect(target()).toContainText(name);
      await expect(source()).not.toContainText(name);
    });
  } finally {
    await page.keyboard.press("Escape");
    const button = board.locator(
      `[aria-label="从周一午餐移除${name}"], [aria-label="从周一晚餐移除${name}"]`,
    );
    if ((await button.count().catch(() => 0)) > 0) {
      await persistMenuAction(page, () =>
        button.first().evaluate((node: HTMLButtonElement) => node.click()),
      );
      await expect(button).toHaveCount(0);
    }
  }
});

async function openTray(page: Page) {
  const tray = page.getByRole("button", { name: /本周已点 \d+ 道/ });
  if ((await tray.getAttribute("aria-expanded")) !== "true") await tray.click();
  await expect(page.locator("#week-tray-panel")).toBeVisible();
}

async function addDish(page: Page, dishName: string, slotName: string) {
  const card = page.getByRole("listitem").filter({
    has: page.getByRole("heading", {
      name: dishName,
      level: 3,
      exact: true,
    }),
  });
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: /^(＋添加|已加 \d+ 次)$/ }).click();
  const sheet = page.locator(".add-day-dialog");
  await expect(sheet).toBeVisible();
  const cell = slotButton(sheet, slotName);
  await cell.click();
  await expect(cell).toHaveAttribute("aria-pressed", "true");
  await persistMenuAction(page, () =>
    sheet.getByRole("button", { name: "添加", exact: true }).click(),
  );
  await expect(sheet).toHaveCount(0);
}

async function hold(
  page: Page,
  target: Locator,
  finish: (session: CDPSession) => Promise<void>,
) {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const point = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
    id: 1,
  };
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    await page.waitForTimeout(HOLD_BEFORE_DRAG_MS + 80);
    await finish(session);
  } finally {
    await session.detach().catch(() => {});
  }
}
