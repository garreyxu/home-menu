import { slotButton } from "./slots";
import {
  test,
  expect,
  persistMenuAction,
  waitForMenuActions,
  cleanupWorldAfterEach,
} from "./fixtures";
import { mkdir } from "node:fs/promises";
import { type Page } from "@playwright/test";
import { e2eCredentials, login } from "./credentials";
import { formatWeekRange } from "../../src/server/week";

// Keep the interaction sequence serial; every test owns a fresh reserved week.
test.describe.configure({ mode: "serial" });

const credentials = e2eCredentials();
cleanupWorldAfterEach();

const shownBoard = (page: Page) =>
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
    world,
  }) => {
    test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");
    test.setTimeout(90_000);
    const name = `Takeout ${width} ${crypto.randomUUID().slice(0, 8)}`;
    const renamed =
      width === 390 ? "火锅聚餐" : `聚餐 ${crypto.randomUUID().slice(0, 8)}`;
    await page.setViewportSize({ width, height: 900 });
    await login(page, credentials!.username, credentials!.password);
    await page.goto(
      `/?week=${world.weeks[0]}&category=${encodeURIComponent(world.dishes[0]!.category)}`,
    );
    await showBoard(page, width);
    const range = shownBoard(page).locator(".week-board-range");
    await expect(range).toContainText(formatWeekRange(world.weeks[0]!));
    const stampsBefore = await page
      .locator(".dish-grid [data-slot-trigger]")
      .allTextContents();
    const before = Number(/已点 (\d+) 道/.exec(await range.innerText())![1]);
    expect(before).toBe(0);
    let ownedId: string | null = null;
    let renamedSlot = "周三午餐";
    try {
      await shownBoard(page)
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
      await expect(
        editor.getByText(`${name.length}/40`, { exact: true }),
      ).toBeVisible();
      await expect(submit).toBeDisabled();
      await slotButton(editor, "周一晚餐").click();
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
        for (const target of [
          editor,
          submit,
          editor.getByText(`${name.length}/40`, { exact: true }),
          slotButton(editor, "周一晚餐"),
        ]) {
          const fit = (await target.boundingBox())!;
          expect(fit.x).toBeGreaterThanOrEqual(16);
          expect(fit.y).toBeGreaterThanOrEqual(16);
          expect(fit.x + fit.width).toBeLessThanOrEqual(1424);
          expect(fit.y + fit.height).toBeLessThanOrEqual(884);
        }
      }
      await mkdir("preview-screenshots", { recursive: true });
      await page.screenshot({
        path: `preview-screenshots/custom-${width === 390 ? "sheet-390" : "popover-1440x900"}.png`,
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
      await expect(range).toHaveText(
        `${formatWeekRange(world.weeks[0]!)} · 已点 ${before + 1} 道`,
        { timeout: 15_000 },
      );
      expect(
        await page.locator(".dish-grid [data-slot-trigger]").allTextContents(),
      ).toEqual(stampsBefore);
      let chip = shownBoard(page)
        .locator(".week-custom-chip")
        .filter({
          has: page.getByRole("button", { name: `编辑${name}`, exact: true }),
        });
      await expect(chip.locator(".custom-seal")).toHaveText("外");
      ownedId = await chip.getAttribute("data-item-id");
      await expect(chip.locator(".week-dish-name")).toHaveAttribute(
        "title",
        name,
      );
      // Check the live editor data before a reload can repair stale props.
      await shownBoard(page)
        .getByRole("button", { name: "＋ 自定义（外卖、聚餐…）", exact: true })
        .click();
      const liveEditor = page.getByRole("dialog", {
        name: "自定义条目",
        exact: true,
      });
      await liveEditor.getByRole("textbox").fill(` ${name.toUpperCase()} `);
      const liveSlot = slotButton(liveEditor, "周一晚餐");
      await expect(liveSlot).toContainText(name);
      await liveSlot.click();
      await expect(liveEditor.getByRole("alert")).toHaveText("这顿已经有了");
      await expect(
        liveEditor.getByRole("button", { name: "放进去", exact: true }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await waitForMenuActions(page);
      await page.reload();
      await showBoard(page, width);
      await expect(range).toHaveText(
        `${formatWeekRange(world.weeks[0]!)} · 已点 ${before + 1} 道`,
        { timeout: 15_000 },
      );
      await shownBoard(page)
        .getByRole("button", { name: "＋ 自定义（外卖、聚餐…）", exact: true })
        .click();
      editor = page.getByRole("dialog", { name: "自定义条目", exact: true });
      await editor.getByRole("textbox").fill(` ${name.toUpperCase()} `);
      await slotButton(editor, "周一晚餐").click();
      await expect(editor.getByRole("alert")).toHaveText("这顿已经有了");
      await expect(
        editor.getByRole("button", { name: "放进去", exact: true }),
      ).toBeDisabled();
      await expect(range).toContainText(`已点 ${before + 1} 道`);
      await page.keyboard.press("Escape");
      await expect(editor).toHaveCount(0);
      await waitForMenuActions(page);
      await page.reload();
      await showBoard(page, width);
      await expect(chip).toHaveCount(1);
      await expect(range).toContainText(`已点 ${before + 1} 道`);
      await chip
        .getByRole("button", { name: `编辑${name}`, exact: true })
        .click();
      editor = page.getByRole("dialog", {
        name: "编辑自定义条目",
        exact: true,
      });
      await expect(editor.getByRole("textbox")).toHaveValue(name);
      await expect(slotButton(editor, "周一晚餐")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await editor.getByRole("textbox").fill(renamed);
      const renameCell =
        width === 390
          ? editor
              .locator(".add-day-cell")
              .filter({ hasNotText: renamed })
              .first()
          : slotButton(editor, "周三午餐");
      renamedSlot = (await renameCell.getAttribute("aria-label"))!;
      await renameCell.click();
      await editor.getByRole("button", { name: "保存", exact: true }).click();
      await expect(editor).toHaveCount(0);
      chip = shownBoard(page).locator(`[data-item-id="${ownedId}"]`);
      if (width === 390) {
        const label = chip.locator(".week-dish-name");
        await expect(label).toHaveText("火锅聚餐");
        const dimensions = await label.evaluate((node) => ({
          scroll: node.scrollHeight,
          height: node.clientHeight,
          nowrap: getComputedStyle(node).whiteSpace,
        }));
        expect(dimensions.nowrap).toBe("normal");
        expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.height);
        await page.screenshot({
          path: "preview-screenshots/custom-chip-390.png",
        });
      }
      await expect(
        chip.getByRole("button", {
          name: `从${renamedSlot}移除${renamed}`,
          exact: true,
        }),
      ).toHaveCount(1);
      await expect(range).toHaveText(
        `${formatWeekRange(world.weeks[0]!)} · 已点 ${before + 1} 道`,
        { timeout: 15_000 },
      );
    } finally {
      await page.keyboard.press("Escape");
      await showBoard(page, width);
      if (ownedId) {
        const remove = shownBoard(page).locator(
          `[data-item-id="${ownedId}"] .week-remove`,
        );
        if (await remove.count()) {
          await persistMenuAction(page, () =>
            remove.evaluate((node: HTMLButtonElement) => node.click()),
          );
          await expect(remove).toHaveCount(0);
        }
      }
      // Removal is a server action too: settle it before the next viewport
      // reads its baseline from this shared week.
      await expect(range).toHaveText(
        `${formatWeekRange(world.weeks[0]!)} · 已点 ${before} 道`,
        { timeout: 15_000 },
      );
    }
  });
}

test("§4 selected slot screenshots", async ({ page, world }) => {
  test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, credentials!.username, credentials!.password);
  await page.goto(
    `/?week=${world.weeks[0]}&category=${encodeURIComponent(world.dishes[0]!.category)}`,
  );
  const card = page.locator(".dish-grid > li").filter({
    has: page.getByRole("heading", {
      name: world.dishes[0]!.name,
      exact: true,
    }),
  });
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
    await expect(shownBoard(page).locator(".slot-hint")).toContainText(
      dishName,
    );
    await expect(shownBoard(page).locator(".slot-target")).toHaveCount(21);
    await page.screenshot({
      path: "preview-screenshots/add-slot-select-1440.png",
    });
  } finally {
    await page.keyboard.press("Escape");
  }
});

test("designer: custom chip with 外 seal at 1440", async ({
  page,
  world,
}, testInfo) => {
  test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, credentials!.username, credentials!.password);
  await page.goto(
    `/?week=${world.weeks[0]}&category=${encodeURIComponent(world.dishes[0]!.category)}`,
  );
  const board = shownBoard(page);
  const range = board.locator(".week-board-range");
  await expect(range).toContainText(formatWeekRange(world.weeks[0]!));
  const before = Number(/已点 (\d+) 道/.exec(await range.innerText())![1]);
  expect(before).toBe(0);
  const name = "寿司外卖";
  let slot: string | null = null;
  try {
    await board
      .getByRole("button", { name: "＋ 自定义（外卖、聚餐…）", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "自定义条目",
      exact: true,
    });
    await editor.getByRole("textbox").fill(name);
    // Never delete or reuse an existing designer-named item.
    const cell = editor
      .locator(".add-day-cell")
      .filter({ hasNotText: name })
      .first();
    slot = await cell.getAttribute("aria-label");
    await cell.click();
    await editor.getByRole("button", { name: "放进去", exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(range).toHaveText(
      `${formatWeekRange(world.weeks[0]!)} · 已点 ${before + 1} 道`,
      { timeout: 15_000 },
    );
    // A populated slot may have collapsed the newly appended chip.
    for (const more of await board.locator(".week-more").all())
      await more.click();
    const chip = board.locator(".week-custom-chip").filter({
      has: page.getByRole("button", {
        name: `从${slot}移除${name}`,
        exact: true,
      }),
    });
    await expect(chip.locator(".custom-seal")).toHaveText("外");
    await chip.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    await mkdir("preview-screenshots", { recursive: true });
    const path = "preview-screenshots/custom-chip-1440.png";
    await board.screenshot({ path });
    await testInfo.attach("custom-chip-1440", {
      path,
      contentType: "image/png",
    });
  } finally {
    await page.keyboard.press("Escape");
    if (slot) {
      for (const more of await board.locator(".week-more").all())
        await more.click();
      const remove = board.getByRole("button", {
        name: `从${slot}移除${name}`,
        exact: true,
      });
      if (await remove.count()) {
        await persistMenuAction(page, () =>
          remove.evaluate((node: HTMLButtonElement) => node.click()),
        );
        await expect(remove).toHaveCount(0);
      }
      await expect(range).toHaveText(
        `${formatWeekRange(world.weeks[0]!)} · 已点 ${before} 道`,
        { timeout: 15_000 },
      );
    }
  }
});
