import { mkdir } from "node:fs/promises";
import { expect, test, type Page, type Locator } from "@playwright/test";
import { e2eCredentials, login } from "./credentials";
import { shiftWeek, toWeekStart } from "../../src/server/week";

test.describe.configure({ mode: "serial" });
const credentials = e2eCredentials();
const week = shiftWeek(toWeekStart(new Date()), 3);
const shownBoard = (page: Page) =>
  page.locator(
    ".week-panel:visible, .week-drawer-panel:visible, #week-tray-panel:visible",
  );
const cell = (page: Page, slot: string) =>
  shownBoard(page).locator(`[data-slot="${slot}"]`);
const chip = (page: Page, name: string) =>
  shownBoard(page)
    .locator(".week-chip")
    .filter({ has: page.locator(".week-dish-name", { hasText: name }) });
async function screenshot(page: Page, name: string) {
  await mkdir("preview-screenshots", { recursive: true });
  await page.screenshot({ path: `preview-screenshots/${name}.png` });
}
async function longPress(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await page.waitForTimeout(400);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(page.locator(".move-overlay")).toHaveCount(0);
  } finally {
    await session.detach();
  }
}

async function addCustom(page: Page, name: string) {
  await shownBoard(page)
    .getByRole("button", { name: "＋ 自定义（外卖、聚餐…）", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "自定义条目", exact: true });
  await editor.getByRole("textbox").fill(name);
  await editor.getByRole("button", { name: "周一午餐", exact: true }).click();
  await editor.getByRole("button", { name: "放进去", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(chip(page, name)).toHaveCount(1);
}
async function drag(
  page: Page,
  source: Locator,
  target: Locator,
  shot: string,
) {
  const from = (await source.boundingBox())!,
    to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2, {
    steps: 3,
  });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height - 16, {
    steps: 12,
  });
  await expect(target.locator(".move-hint")).toBeVisible();
  await expect(page.locator(".move-overlay")).toBeVisible();
  await screenshot(page, shot);
  const final = (await target.boundingBox())!;
  await page.mouse.move(final.x + final.width / 2, final.y + final.height / 2);
  await page.mouse.up();
  await expect(page.locator(".move-overlay")).toHaveCount(0);
}
for (const width of [1440, 390]) {
  test.describe(`${width}px`, () => {
    test.use({ hasTouch: width === 390 });
    test(`§6 moves at ${width}`, async ({ page }) => {
      test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");
      test.setTimeout(120_000);
      const name = `Move ${crypto.randomUUID().slice(0, 8)}`;
      const renamed = `${name} renamed`;
      const ownedIds = new Set<string>();
      const dishSlots: string[] = [];
      let dishName = "";
      await page.setViewportSize({ width, height: 1000 });
      await login(page, credentials!.username, credentials!.password);
      await page.goto(`/?week=${week}`);
      if (width === 390)
        await page.getByRole("button", { name: /本周已点 \d+ 道/ }).click();
      const range = shownBoard(page).locator(".week-board-range");
      const before = Number(/已点 (\d+) 道/.exec(await range.innerText())![1]);
      try {
        for (const slot of await shownBoard(page).locator(".week-slot").all()) {
          const rect = (await slot.boundingBox())!;
          expect(rect.width).toBeGreaterThanOrEqual(44);
          expect(rect.height).toBeGreaterThanOrEqual(44);
        }
        await addCustom(page, name);
        ownedIds.add((await chip(page, name).getAttribute("data-item-id"))!);
        if (width === 1440) {
          const card = page.locator(".dish-grid > li").first();
          dishName = await card.getByRole("heading", { level: 3 }).innerText();
          for (const slot of ["0:breakfast", "2:dinner"]) {
            await card.locator("[data-slot-trigger]").click();
            const target = cell(page, slot).locator(".slot-target");
            await expect(target).toHaveAttribute("aria-disabled", "false");
            await target.click();
            const addedChip = cell(page, slot)
              .locator(".week-chip")
              .filter({ hasText: dishName });
            await expect(addedChip).not.toHaveAttribute(
              "data-item-id",
              /^pending:/,
            );
            ownedIds.add((await addedChip.getAttribute("data-item-id"))!);
            dishSlots.push(slot);
            await expect(cell(page, slot).locator(".week-chip")).toContainText(
              dishName,
            );
            await expect(range).toContainText(
              `已点 ${before + 1 + dishSlots.length} 道`,
            );
          }
          const stamps = await card.locator("[data-slot-trigger]").innerText();
          await drag(
            page,
            cell(page, "0:breakfast")
              .locator(".week-chip")
              .filter({ hasText: dishName }),
            cell(page, "3:dinner"),
            "drag-move-1440",
          );
          dishSlots[0] = "3:dinner";
          await expect(cell(page, "3:dinner")).toContainText(dishName);
          await drag(
            page,
            cell(page, "3:dinner")
              .locator(".week-chip")
              .filter({ hasText: dishName }),
            cell(page, "2:dinner"),
            "drag-duplicate-1440",
          );
          await expect(page.locator(".menu-toast[role=alert]")).toHaveText(
            "这顿已经有了",
          );
          await expect(cell(page, "3:dinner")).toContainText(dishName);
          await drag(
            page,
            chip(page, name),
            cell(page, "4:lunch"),
            "drag-custom-1440",
          );
          await expect(cell(page, "4:lunch")).toContainText(name);
          await chip(page, name).focus();
          await page.keyboard.press("Space");
          await expect(page.locator(".move-overlay")).toBeVisible();
          await page.keyboard.press("ArrowDown");
          await expect(
            cell(page, "5:lunch").locator(".move-hint"),
          ).toBeVisible();
          await page.keyboard.press("Space");
          await expect(cell(page, "5:lunch")).toContainText(name);
          await expect(card.locator("[data-slot-trigger]")).toHaveText(stamps);
          await expect(range).toContainText(`已点 ${before + 3} 道`);
        } else {
          await expect(chip(page, name).locator(".week-remove")).toBeHidden();
          await longPress(page, chip(page, name));
          let menu = page.getByRole("dialog");
          await expect(
            menu.getByRole("button", { name: "移到…", exact: true }),
          ).toBeVisible();
          for (const row of await menu.locator(".week-press-action").all())
            expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(
              48,
            );
          await screenshot(page, "longpress-menu-390");
          await menu
            .getByRole("button", { name: "移到…", exact: true })
            .click();
          menu = page.getByRole("dialog");
          await expect(menu.getByText("现在在这")).toBeVisible();
          await menu
            .getByRole("button", { name: "周三晚餐", exact: true })
            .click();
          await expect(menu.getByText("✓ 移到这")).toBeVisible();
          for (const row of await menu.locator(".add-day-cell").all()) {
            const rect = (await row.boundingBox())!;
            expect(rect.height).toBeGreaterThanOrEqual(44);
            expect(rect.width).toBeGreaterThanOrEqual(44);
          }
          await screenshot(page, "move-sheet-390");
          await menu
            .getByRole("button", { name: "移过去", exact: true })
            .click();
          await expect(cell(page, "3:dinner")).toContainText(name);
          await longPress(page, chip(page, name));
          await page.getByRole("button", { name: "改名", exact: true }).click();
          const editor = page.getByRole("dialog", {
            name: "编辑自定义条目",
            exact: true,
          });
          await expect(editor.getByRole("textbox")).toHaveValue(name);
          await editor.getByRole("textbox").fill(renamed);
          await editor
            .getByRole("button", { name: "保存", exact: true })
            .click();
          await expect(editor).toHaveCount(0);
          await longPress(page, chip(page, renamed));
          await page
            .getByRole("button", { name: "从这顿删掉", exact: true })
            .click();
          await expect(chip(page, renamed)).toHaveCount(0);
          await expect(range).toContainText(`已点 ${before} 道`);
        }
      } finally {
        await page.mouse.up();
        await page.keyboard.press("Escape");
        for (const id of ownedIds) {
          const remove = shownBoard(page).locator(
            `[data-item-id="${id}"] .week-remove`,
          );
          if (await remove.count()) {
            await remove.evaluate((node: HTMLButtonElement) => node.click());
            await expect(remove).toHaveCount(0);
          }
        }
        await expect(range).toContainText(`已点 ${before} 道`);
      }
    });
  });
}
