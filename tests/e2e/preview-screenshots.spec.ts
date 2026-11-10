import { test, expect, persistMenuAction } from "./fixtures";
import { mkdir } from "node:fs/promises";

import { e2eCredentials, login } from "./credentials";

const credentials = e2eCredentials();

const widths = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
  { width: 3440, height: 1440 },
] as const;

test("signed-in dish wall screenshots", async ({ page, world }) => {
  test.skip(
    !process.env.PREVIEW_SCREENSHOTS,
    "preview screenshots run only in preview-e2e",
  );
  test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");
  const { username, password } = credentials!;

  await login(page, username, password);
  await page.goto(
    `/?week=${world.weeks[0]}&category=${encodeURIComponent(world.dishes[0]!.category)}`,
  );
  await mkdir("preview-screenshots", { recursive: true });

  for (const viewport of widths) {
    await page.setViewportSize(viewport);
    await page.goto(
      `/?week=${world.weeks[0]}&category=${encodeURIComponent(world.dishes[0]!.category)}`,
    );
    await page.evaluate(() => document.fonts.ready);
    const cardName = page
      .locator("ul.dish-grid")
      .getByRole("heading", { level: 3 })
      .first();
    await expect(cardName).toBeVisible();
    await page.screenshot({
      path: `preview-screenshots/dish-wall-${viewport.width}.png`,
      fullPage: true,
    });

    const tray = page.getByRole("button", { name: /本周已点 \d+ 道/ });
    if (viewport.width < 1024) {
      await expect(tray).toBeVisible();
      if ((await tray.getAttribute("aria-expanded")) !== "true") {
        await tray.click();
      }
    }
    const board = page.getByRole("region", { name: "一周菜单" });
    await expect(board).toBeVisible();
    await page.evaluate(() => {
      for (const node of document.querySelectorAll<HTMLElement>(
        ".week-panel, .week-tray-panel",
      )) {
        node.style.maxHeight = "none";
        node.style.overflow = "visible";
      }
    });
    await page.screenshot({
      path: `preview-screenshots/week-board-${viewport.width}.png`,
      fullPage: true,
    });
    if (viewport.width < 1024) await tray.click();
  }
});

test("recipe sheet and illustration review screenshots", async ({
  browser,
  baseURL,
  extraHTTPHeaders,
}) => {
  test.skip(
    !process.env.PREVIEW_SCREENSHOTS,
    "preview screenshots run only in preview-e2e",
  );
  test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");
  test.setTimeout(180_000);
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    baseURL,
    extraHTTPHeaders,
  });
  const page = await context.newPage();
  await login(page, credentials!.username, credentials!.password);
  await mkdir("preview-screenshots", { recursive: true });
  const ready = async () => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images).map(async (img) => {
          if (!img.complete)
            await new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            });
        }),
      );
    });
  };
  try {
    for (const viewport of widths) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.locator(".dish-card").first()).toBeVisible();
      await ready();
      const illustrated = page
        .locator("ul.dish-grid > li")
        .filter({ has: page.locator("img.dish-art") });
      if (viewport.width >= 1440) {
        await page.screenshot({
          path: `preview-screenshots/card-grid-${viewport.width}.png`,
        });
        if (await illustrated.count()) {
          const light = illustrated.filter({
            has: page.getByRole("heading", { name: /生菜|豆腐/ }),
          });
          const art = (
            (await light.count()) ? light.first() : illustrated.first()
          ).locator(".dish-art-clip");
          expect(
            await art
              .locator("img")
              .evaluate((img) => (img as HTMLImageElement).naturalWidth),
          ).toBeGreaterThan(0);
          await art.screenshot({
            path: `preview-screenshots/card-blend-zoom-${viewport.width}.png`,
          });
        }
      }
      const preferred = illustrated.filter({
        has: page.getByRole("heading", { name: "番茄炒蛋", exact: true }),
      });
      const allCards = page.locator("ul.dish-grid > li");
      const candidates = [
        ...(await preferred.all()),
        ...(await illustrated.all()),
        ...(await allCards.all()),
      ];
      let captured = false;
      let stepsCaptured = false;
      let emptyCaptured = false;
      for (let i = 0; i < candidates.length; i++) {
        await candidates[i].locator(".dish-recipe-entry").click();
        const dialog = page.getByRole("dialog");
        await expect(dialog.getByText("正在打开做法")).toHaveCount(0);
        await ready();
        const image = dialog.locator("img");
        if (await image.count())
          expect(
            await image.evaluate(
              (img) => (img as HTMLImageElement).naturalWidth,
            ),
          ).toBeGreaterThan(0);
        if (
          !captured &&
          (await image.count()) &&
          (await dialog.locator(".recipe-body").count())
        ) {
          await page.screenshot({
            path: `preview-screenshots/recipe-sheet-${viewport.width}.png`,
          });
          captured = true;
        }
        if (
          viewport.width === 1440 &&
          !emptyCaptured &&
          (await dialog.getByText("待补", { exact: true }).count())
        ) {
          await page.screenshot({
            path: "preview-screenshots/recipe-sheet-empty-1440.png",
          });
          emptyCaptured = true;
        }
        const stepsHeading = dialog
          .getByRole("heading", { name: "步骤", exact: true })
          .first();
        if (!stepsCaptured && (await stepsHeading.count())) {
          const numbered = stepsHeading.locator(
            "xpath=following-sibling::ol[1]",
          );
          if (await numbered.count()) {
            const firstStep = numbered.locator(":scope > li").first();
            await stepsHeading.evaluate((heading) => {
              const scroll = heading.closest(".recipe-scroll");
              if (scroll)
                scroll.scrollTop +=
                  heading.getBoundingClientRect().top -
                  scroll.getBoundingClientRect().top -
                  12;
            });
            await ready();
            await expect(stepsHeading).toBeInViewport();
            const seal = await firstStep.evaluate((item) => {
              const style = getComputedStyle(item, "::before");
              const scroll = item
                .closest(".recipe-scroll")!
                .getBoundingClientRect();
              const top =
                item.getBoundingClientRect().top + parseFloat(style.top);
              return {
                top,
                bottom: top + parseFloat(style.height),
                scrollTop: scroll.top,
                scrollBottom: scroll.bottom,
                width: style.width,
                radius: style.borderRadius,
                color: style.backgroundColor,
              };
            });
            expect(seal.width).toBe("24px");
            expect(seal.radius).toBe("50%");
            expect(seal.color).toBe("rgb(200, 48, 40)");
            expect(seal.top).toBeGreaterThanOrEqual(seal.scrollTop);
            expect(seal.bottom).toBeLessThanOrEqual(
              Math.min(seal.scrollBottom, viewport.height),
            );
            await expect(firstStep).toHaveCSS(
              "counter-increment",
              "recipe-step 1",
            );
            await page.screenshot({
              path: `preview-screenshots/recipe-sheet-steps-${viewport.width}.png`,
            });
            stepsCaptured = true;
          }
        }
        await dialog.getByRole("button", { name: "关闭", exact: true }).click();
        if (
          captured &&
          stepsCaptured &&
          (viewport.width !== 1440 || emptyCaptured)
        )
          break;
      }
      expect(
        stepsCaptured,
        `No numbered 步骤 section found at ${viewport.width}px`,
      ).toBe(true);
    }
  } finally {
    await context.close();
  }
});

for (const width of [390, 1440]) {
  test(`long dish name stays within two lines at ${width}px`, async ({
    page,
    world,
  }) => {
    const credentials = e2eCredentials();
    test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");
    const dish = world.dishes.find(
      (dish) => dish.name === "秘制蜜汁叉烧配手工鸡蛋面条",
    );
    test.skip(
      !process.env.PLAYWRIGHT_BASE_URL && !dish,
      "Long-name fixture requires the preview database world",
    );
    expect(dish, "Preview world must seed the long-name dish").toBeDefined();
    expect(world.weeks[0]).toMatch(/^209\d-/);
    // Add at desktop size, then measure the persisted item at the target width.
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, credentials!.username, credentials!.password);
    await page.goto(
      `/?week=${world.weeks[0]}&category=${encodeURIComponent(dish!.category)}`,
    );
    const board = page.getByRole("region", { name: "一周菜单" });
    const card = page.locator(".dish-card").filter({
      has: page.getByRole("heading", { name: dish!.name, exact: true }),
    });
    await card.getByRole("button", { name: /^(＋添加|已加 \d+ 次)$/ }).click();
    await persistMenuAction(page, () =>
      board.getByRole("button", { name: "周二晚餐", exact: true }).click(),
    );
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    if (width < 1024) {
      const tray = page.getByRole("button", { name: /本周已点 \d+ 道/ });
      if ((await tray.getAttribute("aria-expanded")) !== "true")
        await tray.click();
    }
    await expect(board).toBeVisible();
    const chip = board.locator(".week-chip").filter({ hasText: dish!.name });
    const name = chip.locator(".week-dish-name");
    await expect(name).toBeVisible();
    await expect(chip).toHaveAttribute("title", dish!.name);
    await expect(name).toHaveAttribute("title", dish!.name);
    await expect(name).toHaveAttribute("aria-label", dish!.name);
    await page.evaluate(() => document.fonts.ready);
    const size = await name.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(element).lineHeight),
    }));
    expect(size.height).toBeLessThanOrEqual(2 * size.lineHeight + 1);
    for (const element of [chip, board]) {
      expect(
        await element.evaluate(
          (node) => node.scrollWidth <= node.clientWidth + 1,
        ),
      ).toBe(true);
    }
    if (process.env.PREVIEW_SCREENSHOTS) {
      await mkdir("preview-screenshots", { recursive: true });
      await page.screenshot({
        path: `preview-screenshots/week-board-longname-${width}.png`,
        fullPage: true,
      });
    }
  });
}
