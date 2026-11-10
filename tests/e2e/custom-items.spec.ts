import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { e2eCredentials, login } from "./credentials";
import { formatWeekRange, shiftWeek, toWeekStart } from "../../src/server/week";

const credentials = e2eCredentials();
const week = shiftWeek(toWeekStart(new Date()), 1);
const board = (page: Page) =>
  page.locator(
    ".week-panel:visible, .week-drawer-panel:visible, #week-tray-panel:visible",
  );

async function showBoard(page: Page, width: number) {
  if (width < 1024) {
    const tray = page.getByRole("button", { name: /本周已点 \d+ 道/ });
    if ((await tray.getAttribute("aria-expanded")) !== "true")
      await tray.click();
  }
}

for (const width of [1440, 390]) {
  test(`custom items at ${width}: add, duplicate, rename and move`, async ({
    page,
  }) => {
    test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");
    test.setTimeout(90_000);
    const name = `Takeout ${width} ${crypto.randomUUID().slice(0, 8)}`;
    const renamed = `聚餐 ${crypto.randomUUID().slice(0, 8)}`;
    await page.setViewportSize({ width, height: 900 });
    await login(page, credentials!.username, credentials!.password);
    await page.goto(`/?week=${week}`);
    await showBoard(page, width);
    const range = board(page).locator(".week-board-range");
    await expect(range).toContainText(formatWeekRange(week));
    const stampsBefore = await page
      .locator(".dish-grid [data-slot-trigger]")
      .allTextContents();
    const before = Number(/已点 (\d+) 道/.exec(await range.innerText())![1]);
    try {
      await board(page)
        .getByRole("button", { name: "＋ 自定义（外卖、聚餐…）", exact: true })
        .click();
      let editor = page.getByRole("dialog", {
        name: "自定义条目",
        exact: true,
      });
      await expect(editor).toHaveClass(
        new RegExp(width === 1440 ? "is-popover" : "is-sheet"),
      );
      const input = editor.getByPlaceholder("写点什么，比如：寿司外卖");
      await expect(input).toBeFocused();
      const submit = editor.getByRole("button", {
        name: "放进去",
        exact: true,
      });
      await expect(submit).toBeDisabled();
      await input.fill(` ${name} `);
      await expect(submit).toBeDisabled();
      await editor
        .getByRole("button", { name: "周一晚餐", exact: true })
        .click();
      await expect(editor.getByText("✓ 加这顿")).toBeVisible();
      if (width === 390) {
        const cells = await editor
          .locator(".add-day-cell")
          .evaluateAll((nodes) =>
            nodes.map((n) => ({
              width: n.getBoundingClientRect().width,
              height: n.getBoundingClientRect().height,
            })),
          );
        for (const cell of cells) {
          expect(cell.width).toBeGreaterThanOrEqual(44);
          expect(cell.height).toBeGreaterThanOrEqual(44);
        }
        expect((await submit.boundingBox())!.height).toBe(48);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        expect(
          await editor.evaluate((node) => node.scrollWidth <= node.clientWidth),
        ).toBe(true);
      }
      if (width === 1440) {
        const fit = await submit.boundingBox();
        expect(fit!.y + fit!.height).toBeLessThanOrEqual(900);
      }
      await mkdir("preview-screenshots", { recursive: true });
      await page.screenshot({
        path: `preview-screenshots/custom-${width === 390 ? "sheet" : "popover"}-${width}.png`,
      });
      await submit.focus();
      await page.keyboard.press("Tab");
      await expect(
        editor.getByRole("button", { name: "取消", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(submit).toBeFocused();
      await submit.click();
      await expect(editor).toHaveCount(0);
      await expect(range).toContainText(`已点 ${before + 1} 道`);
      expect(
        await page.locator(".dish-grid [data-slot-trigger]").allTextContents(),
      ).toEqual(stampsBefore);
      let chip = board(page)
        .locator(".week-custom-chip")
        .filter({
          has: page.getByRole("button", { name: `编辑${name}`, exact: true }),
        });
      await expect(chip.locator(".custom-seal")).toHaveText("外");
      await expect(chip.locator(".week-dish-name")).toHaveAttribute(
        "title",
        name,
      );
      await page.reload();
      await showBoard(page, width);
      await expect(range).toContainText(`已点 ${before + 1} 道`);
      await board(page)
        .getByRole("button", { name: "＋ 自定义（外卖、聚餐…）", exact: true })
        .click();
      editor = page.getByRole("dialog", { name: "自定义条目", exact: true });
      await editor.getByRole("textbox").fill(` ${name.toUpperCase()} `);
      await editor
        .getByRole("button", { name: "周一晚餐", exact: true })
        .click();
      await expect(editor.getByRole("alert")).toHaveText("这顿已经有了");
      await expect(
        editor.getByRole("button", { name: "放进去", exact: true }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(editor).toHaveCount(0);
      await chip
        .getByRole("button", { name: `编辑${name}`, exact: true })
        .click();
      editor = page.getByRole("dialog", {
        name: "编辑自定义条目",
        exact: true,
      });
      await expect(editor.getByRole("textbox")).toHaveValue(name);
      await expect(
        editor.getByRole("button", { name: "周一晚餐", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await editor.getByRole("textbox").fill(renamed);
      await editor
        .getByRole("button", { name: "周三午餐", exact: true })
        .click();
      await editor.getByRole("button", { name: "保存", exact: true }).click();
      await expect(editor).toHaveCount(0);
      chip = board(page)
        .locator(".week-custom-chip")
        .filter({
          has: page.getByRole("button", {
            name: `编辑${renamed}`,
            exact: true,
          }),
        });
      await expect(
        chip.getByRole("button", {
          name: `从周三午餐移除${renamed}`,
          exact: true,
        }),
      ).toHaveCount(1);
      await expect(range).toContainText(`已点 ${before + 1} 道`);
    } finally {
      await page.keyboard.press("Escape");
      await showBoard(page, width);
      for (const label of [name, renamed]) {
        const remove = board(page)
          .locator(".week-custom-chip")
          .filter({
            has: page.getByRole("button", {
              name: `编辑${label}`,
              exact: true,
            }),
          })
          .locator(".week-remove");
        if (await remove.count()) {
          await remove.evaluate((node: HTMLButtonElement) => node.click());
          await expect(remove).toHaveCount(0);
        }
      }
    }
  });
}

test("§4 selected slot screenshots", async ({ page }) => {
  test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, credentials!.username, credentials!.password);
  await page.goto(`/?week=${week}`);
  const card = page.locator(".dish-grid > li").first();
  const dishName = await card.getByRole("heading", { level: 3 }).innerText();
  try {
    await card.getByRole("button", { name: /^(＋添加|已加 \d+ 次)$/ }).click();
    const dialog = page.getByRole("dialog", {
      name: `『${dishName}』加到哪一顿？`,
      exact: true,
    });
    await dialog.locator(".add-day-cell:enabled").first().click();
    await expect(dialog.getByText("✓ 加这顿")).toBeVisible();
    await mkdir("preview-screenshots", { recursive: true });
    await page.screenshot({ path: "preview-screenshots/add-sheet-390.png" });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 900 });
    await card.getByRole("button", { name: /^(＋添加|已加 \d+ 次)$/ }).click();
    await expect(board(page).locator(".slot-hint")).toContainText(dishName);
    await expect(board(page).locator(".slot-target")).toHaveCount(21);
    await page.screenshot({
      path: "preview-screenshots/add-slot-select-1440.png",
    });
  } finally {
    await page.keyboard.press("Escape");
  }
});
