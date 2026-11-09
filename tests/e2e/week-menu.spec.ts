import { expect, test, type Page } from "@playwright/test";
import { e2eCredentials, login } from "./credentials";
import { readWall, shortestDishes } from "./wall";

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

    const [dish] = await readWall(page);
    const remove = removeLabel("周二晚餐", dish!.name);

    try {
      await removeIfPresent(page, remove);
      await addDish(page, dish!.name, "周二晚餐");
      await page.keyboard.press("Escape");
      await revealRemove(page, remove);
      await expect(page.getByRole("status")).toContainText("已加到 周二·晚");

      await page.reload();
      await revealRemove(page, remove);

      await removeButton(page, remove).click({ timeout: 5_000 });
      await expect(removeButton(page, remove)).toHaveCount(0);
      await page.reload();
      await expect(removeButton(page, remove)).toHaveCount(0);
    } finally {
      await removeIfPresent(page, remove);
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
    expect(Math.abs(box!.width - 560)).toBeLessThanOrEqual(1);
  });

  test("mobile tray shows the count and the dish after adding", async ({
    page,
  }) => {
    const { username, password } = credentials!;
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, username, password);
    await page.goto(`/?week=${week}`);

    const [dish] = await readWall(page);
    const remove = removeLabel("周三午餐", dish!.name);
    const tray = page.getByRole("button", { name: /本周已点 \d+ 道/ });
    await expect(tray).toBeVisible();
    await openTray(page);
    await removeIfPresent(page, remove);
    await closeTray(page);
    const before = await plannedCount(page);

    try {
      await addDish(page, dish!.name, "周三午餐");
      // The tray updates optimistically. Wait for the server toast before
      // reload, or the preview read can land before the write commits.
      await expect(page.getByRole("status")).toContainText("已加到 周三·中");
      const cell = page.getByRole("button", { name: "周三午餐", exact: true });
      const box = await cell.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await page.keyboard.press("Escape");

      await expect(tray).toHaveText(`本周已点 ${before + 1} 道`);
      await openTray(page);
      await revealRemove(page, remove);
      const trayName = page
        .locator(".week-chip")
        .filter({
          has: page.locator(`.week-remove[aria-label="${remove}"]`),
        })
        .locator(".week-dish-name");
      const trayFit = await trayName.evaluate((node) => {
        const style = getComputedStyle(node);
        const fontSize = Number.parseFloat(style.fontSize);
        return {
          chars: Math.floor((node.clientWidth + 1) / fontSize),
          fontSize: style.fontSize,
          lineClamp: style.getPropertyValue("-webkit-line-clamp"),
          whiteSpace: style.whiteSpace,
        };
      });
      expect(trayFit.fontSize).toBe("13px");
      expect(trayFit.lineClamp).toBe("2");
      expect(trayFit.whiteSpace).toBe("normal");
      expect(trayFit.chars).toBeGreaterThanOrEqual(4);

      await page.reload();
      await expect(tray).toHaveText(`本周已点 ${before + 1} 道`);
      await openTray(page);
      await revealRemove(page, remove);

      await removeButton(page, remove).click({ timeout: 5_000 });
      await expect(removeButton(page, remove)).toHaveCount(0);
    } finally {
      await openTray(page);
      await removeIfPresent(page, remove);
    }
  });

  test("keeps dish names readable on the persistent board", async ({
    page,
  }) => {
    const { username, password } = credentials!;
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, username, password);
    await page.goto(`/?week=${week}`);
    const picked = shortestDishes(await readWall(page), 3);
    const slots = ["周一早餐", "周三午餐", "周五晚餐"] as const;
    const planned = picked.map((dish, index) => {
      const slot = slots[index]!;
      return { dish: dish.name, slot, remove: removeLabel(slot, dish.name) };
    });

    try {
      for (const item of planned) {
        await removeIfPresent(page, item.remove);
        await addDish(page, item.dish, item.slot);
        await page.keyboard.press("Escape");
      }

      for (const width of [1440, 1920, 3440]) {
        await page.setViewportSize({
          width,
          height: width === 3440 ? 1440 : 900,
        });
        const board = page.getByRole("region", { name: "一周菜单" });
        await expect(board).toBeVisible();
        await expect(board.getByRole("button", { name: "空着呢" })).toHaveCount(
          0,
        );
        const expectedWidth = width === 1440 ? 560 : width === 1920 ? 640 : 760;
        const boardBox = await board.boundingBox();
        expect(boardBox).not.toBeNull();
        expect(Math.abs(boardBox!.width - expectedWidth)).toBeLessThanOrEqual(
          1,
        );
        // Any empty slot: the check is that empty slots are not buttons.
        const empty = board.locator(".week-slot-empty").first();
        await expect(empty).toBeVisible();
        expect(await empty.getAttribute("role")).not.toBe("button");
        expect(await empty.evaluate((node) => node.tabIndex)).toBeLessThan(0);

        for (const item of planned) {
          const row = board.locator(".week-chip").filter({
            has: page.locator(`.week-remove[aria-label="${item.remove}"]`),
          });
          await expect(row).toHaveCount(1);
          const remove = row.locator(".week-remove");
          await expect(remove).toHaveCSS("opacity", "0");
          const name = row.locator(".week-dish-name");
          await expect(name).toHaveCount(1);
          await expect(name).toHaveAttribute("title", item.dish);
          await expect(name).toHaveAccessibleName(item.dish);
          const fit = await name.evaluate((node) => {
            const style = getComputedStyle(node);
            const fontSize = Number.parseFloat(style.fontSize);
            const text = node.textContent ?? "";
            return {
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              fontFamily: style.fontFamily,
              whiteSpace: style.whiteSpace,
              // A CJK glyph is about one em wide.
              chars: Math.floor((node.clientWidth + 1) / fontSize),
              text,
              clientWidth: node.clientWidth,
              scrollWidth: node.scrollWidth,
              singleGlyph: /^.\u2026$|^.\.\.\.$/.test(text),
            };
          });
          expect(fit.fontSize).toBe(width >= 2560 ? "15px" : "13px");
          expect(Number(fit.fontWeight)).toBe(500);
          expect(fit.whiteSpace).toBe("nowrap");
          expect(fit.fontFamily).not.toMatch(/Ma Shan Zheng|MaShanZheng/i);
          expect(fit.text).toBe(item.dish);
          expect(fit.singleGlyph).toBe(false);
          expect(fit.chars).toBeGreaterThanOrEqual(2);
          expect(fit.clientWidth).toBeGreaterThan(0);
          expect(fit.scrollWidth / fit.clientWidth).toBeLessThan(1.35);
          await expect(row.locator(".week-thumb")).toHaveCSS(
            "width",
            width >= 2560 ? "30px" : "24px",
          );
          await expect(row.locator(".week-thumb")).toHaveCSS(
            "height",
            width >= 2560 ? "30px" : "24px",
          );

          await row.evaluate((node) => {
            node.scrollIntoView({ block: "center", inline: "nearest" });
          });
          await row.hover({ timeout: 5_000 });
          await expect(remove).toHaveCSS("opacity", "1");
          const nameBox = await name.boundingBox();
          const removeBox = await remove.boundingBox();
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
        await removeIfPresent(page, item.remove);
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

function removeLabel(slot: string, dish: string): string {
  return `从${slot}移除${dish}`;
}

function shownBoard(page: Page) {
  return page.locator(
    ".week-panel:visible, .week-drawer-panel:visible, #week-tray-panel:visible",
  );
}

function removeButton(page: Page, name: string) {
  return shownBoard(page).locator(`.week-remove[aria-label="${name}"]`);
}

async function revealRemove(page: Page, name: string) {
  const button = removeButton(page, name);
  await expect(button).toHaveCount(1);
  await expect(button).toHaveCSS("opacity", "0");
  const chip = button.locator(
    "xpath=ancestor::li[contains(@class,'week-chip')]",
  );
  // Playwright's scroll chases the sticky board. Scroll the chip ourselves,
  // and don't let a covered chip consume the whole test timeout.
  await chip.evaluate((node) => {
    node.scrollIntoView({ block: "center", inline: "nearest" });
  });
  await chip.hover({ timeout: 5_000 });
  await expect(button).toHaveCSS("opacity", "1");
  return button;
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
  // Already on this week, the stamp says "已加 N 次" and still opens the picker.
  await card
    .getByRole("button", { name: /^(＋添加|已加 \d+ 次)$/ })
    .click();
  await page.getByRole("button", { name: slotName, exact: true }).click();
}

async function removeIfPresent(page: Page, name: string) {
  if (page.isClosed()) return;
  const button = removeButton(page, name);
  if ((await button.count().catch(() => 0)) === 0) return;
  // × stays transparent until hover. A DOM click still runs the handler,
  // including from finally after a failure, without waiting out the test.
  await button.evaluate((node) => {
    if (node instanceof HTMLButtonElement) node.click();
  });
  await expect(button).toHaveCount(0);
}

async function openTray(page: Page) {
  const tray = page.getByRole("button", { name: /本周已点 \d+ 道/ });
  if ((await tray.getAttribute("aria-expanded")) !== "true") await tray.click();
}

async function closeTray(page: Page) {
  const tray = page.getByRole("button", { name: /本周已点 \d+ 道/ });
  if ((await tray.getAttribute("aria-expanded")) === "true") await tray.click();
}

async function plannedCount(page: Page): Promise<number> {
  const tray = page.getByRole("button", { name: /本周已点 \d+ 道/ });
  await expect(tray).toBeVisible();
  const match = /(\d+)/.exec(await tray.innerText());
  expect(match, "看不懂「本周已点」的数量").not.toBeNull();
  return Number(match![1]);
}
