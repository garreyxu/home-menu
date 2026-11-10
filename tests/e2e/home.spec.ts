import { test, expect } from "./fixtures";
import { type Locator, type Page } from "@playwright/test";
import { e2eCredentials, login } from "./credentials";
import { readWall } from "./wall";

const credentials = e2eCredentials();

/**
 * One stamp per card. Dishes already on the viewed week say "已加 N 次"
 * instead of "＋添加". Count assertions use a run-owned reserved week.
 */
function wallStamps(wall: Locator): Locator {
  return wall.getByRole("button", {
    name: /^(＋添加|已加 \d+ 次)$/,
  });
}

test.describe("dish wall", () => {
  test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");

  test("renders dishes and filters by category link", async ({
    page,
    world,
  }) => {
    const { username, password } = credentials!;
    await login(page, username, password);
    await page.goto(`/?week=${world.weeks[0]}`);

    await expect(page).toHaveTitle("御膳房");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(
      page.getByRole("heading", { name: "御膳房", level: 1 }),
    ).toBeVisible();
    const dishes = await readWall(page, world.dishes);
    const wall = page.locator("ul.dish-grid");
    await expect(wallStamps(wall)).toHaveCount(dishes.length);

    const nav = page.getByRole("navigation", { name: "菜品分类" });
    const navLabels = (await nav.getByRole("link").allInnerTexts()).map(
      (label) => label.trim(),
    );
    expect(navLabels[0]).toBe("全部");
    const navCategories = navLabels.slice(1);
    expect(new Set(navCategories).size).toBe(navCategories.length);
    expect(new Set(navCategories)).toEqual(
      new Set(dishes.map((dish) => dish.category)),
    );

    const category = world.dishes[0]!.category;
    const outsider = dishes.find((dish) => dish.category !== category);
    const categoryLink = nav.getByRole("link", {
      name: category,
      exact: true,
    });
    await expect(categoryLink).toHaveAttribute("href", /\?category=/);
    await categoryLink.click();

    await expect(page).toHaveURL(/category=/);
    const filtered = await readWall(page, world.dishes);
    expect(filtered.every((dish) => dish.category === category)).toBe(true);
    if (outsider) {
      await expect(
        page.getByRole("heading", { name: outsider.name, exact: true }),
      ).toHaveCount(0);
    }
    await expect(wallStamps(wall)).toHaveCount(filtered.length);
    await expect(categoryLink).toHaveAttribute("aria-current", "page");

    await page.getByRole("link", { name: "全部", exact: true }).click();
    await expect(page).toHaveURL(`/?week=${world.weeks[0]}`);
    const restored = await readWall(page, world.dishes);
    // Other CI runs may add/remove their categories between navigations.
    // All of our seeded cards must survive filtering and restoration.
    expect(
      restored.filter((dish) =>
        world.dishes.some((owned) => owned.name === dish.name),
      ),
    ).toHaveLength(world.dishes.length);
    await expect(wallStamps(wall)).toHaveCount(restored.length);
  });

  test("category query is linkable", async ({ page, world }) => {
    const { username, password } = credentials!;
    await login(page, username, password);
    await page.goto(`/?week=${world.weeks[0]}`);

    const dishes = await readWall(page, world.dishes);
    const category = world.dishes[0]!.category;
    const outsider = dishes.find((dish) => dish.category !== category);

    await page.goto(
      `/?week=${world.weeks[0]}&category=` + encodeURIComponent(category),
    );
    const filtered = await readWall(page, world.dishes);
    expect(filtered.every((dish) => dish.category === category)).toBe(true);
    if (outsider) {
      await expect(
        page.getByRole("heading", { name: outsider.name, exact: true }),
      ).toHaveCount(0);
    }

    await page.goto(
      `/?week=${world.weeks[0]}&category=` + encodeURIComponent("没有的分类"),
    );
    await expect(page.getByText("没有这个分类。")).toBeVisible();
    await expect(
      page.locator("ul.dish-grid").getByRole("listitem"),
    ).toHaveCount(0);
    await expect(page.locator("[aria-current='page']")).toHaveCount(0);
  });

  const viewports = [
    { name: "mobile", width: 390, height: 844, columns: 2 },
    {
      name: "desktop",
      width: 1440,
      height: 900,
      board: 560,
      nav: 160,
      columns: 3,
    },
    {
      name: "wide",
      width: 1920,
      height: 1080,
      board: 640,
      nav: 180,
      columns: 4,
    },
    {
      name: "ultrawide",
      width: 3440,
      height: 1440,
      board: 760,
      nav: 220,
      columns: 6,
    },
  ] as const;

  for (const viewport of viewports) {
    test(`layout stays intentional at ${viewport.name}`, async ({
      page,
      world,
    }) => {
      const { username, password } = credentials!;
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await login(page, username, password);
      await page.goto(`/?week=${world.weeks[0]}`);

      await expectNoHorizontalOverflow(page);

      await expect(
        page.locator("ul.dish-grid").getByRole("listitem"),
        "菜品墙是空的，端到端测试需要至少一道菜。",
      ).not.toHaveCount(0);
      // Any card: the width check is about the grid, not a particular dish.
      const card = page.locator("ul.dish-grid").getByRole("listitem").first();
      await expect(card).toBeVisible();
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      if (viewport.name === "mobile") {
        expect(box!.width).toBeGreaterThan(120);
        expect(box!.width).toBeLessThan(220);
      } else if (viewport.name === "desktop") {
        expect(box!.width).toBeGreaterThan(160);
        expect(box!.width).toBeLessThan(280);
      } else if (viewport.name === "wide") {
        expect(box!.width).toBeGreaterThan(200);
        expect(box!.width).toBeLessThan(360);
      } else {
        expect(box!.width).toBeGreaterThan(250);
        expect(box!.width).toBeLessThan(420);
      }

      const columns = await firstRowCount(page.locator("ul.dish-grid"));
      if (viewport.name === "ultrawide") {
        expect(columns).toBeGreaterThanOrEqual(viewport.columns);
      } else {
        expect(columns).toBe(viewport.columns);
      }

      const nav = await page
        .getByRole("navigation", { name: "菜品分类" })
        .boundingBox();
      const main = await page.getByRole("main").boundingBox();
      expect(nav).not.toBeNull();
      expect(main).not.toBeNull();
      if (viewport.name === "mobile") {
        expect(nav!.y).toBeLessThan(main!.y);
        const scrolling = await page
          .locator(".category-nav-list")
          .evaluate((node) => {
            const style = getComputedStyle(node);
            return {
              overflowX: style.overflowX,
              direction: style.flexDirection,
              wrap: style.flexWrap,
              scrollbarWidth: style.scrollbarWidth,
            };
          });
        expect(scrolling.overflowX).toBe("auto");
        expect(scrolling.direction).toBe("row");
        expect(scrolling.wrap).toBe("nowrap");
        expect(scrolling.scrollbarWidth).toBe("none");
        const fade = await page.locator(".category-nav").evaluate((node) => {
          const style = getComputedStyle(node, "::after");
          return { width: style.width, image: style.backgroundImage };
        });
        expect(fade.width).toBe("24px");
        expect(fade.image).toContain("linear-gradient");
      } else {
        expect(nav!.x).toBeLessThan(main!.x);
        expect(Math.abs(nav!.width - viewport.nav)).toBeLessThanOrEqual(1);
        const fade = await page
          .locator(".category-nav")
          .evaluate((node) => getComputedStyle(node, "::after").content);
        expect(fade).toBe("none");
      }

      const board = page.getByRole("region", { name: "一周菜单" });
      if (viewport.name === "mobile") {
        const tray = page.getByRole("button", { name: /本周已点 \d+ 道/ });
        await expect(tray).toBeVisible();
        await expect(board).toHaveCount(0);
        await expect(page.locator(".week-drawer-toggle")).toBeHidden();
        await tray.click();
        await expect(board).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await tray.click();
      } else {
        await expect(board).toBeVisible();
        await expect(page.locator(".week-drawer-toggle")).toBeHidden();
        await expect(page.locator(".week-tray-toggle")).toBeHidden();
        const boardBox = await board.boundingBox();
        expect(boardBox).not.toBeNull();
        expect(boardBox!.x).toBeGreaterThan(main!.x);
        expect(Math.abs(boardBox!.width - viewport.board)).toBeLessThanOrEqual(
          1,
        );
        expect(
          Math.abs(boardBox!.height - (viewport.height - 32)),
        ).toBeLessThanOrEqual(2);
        if (viewport.name === "ultrawide") {
          expect(nav!.x).toBeLessThanOrEqual(120);
          expect(
            viewport.width - (boardBox!.x + boardBox!.width),
          ).toBeLessThanOrEqual(120);
          expect(boardBox!.x + boardBox!.width - nav!.x).toBeGreaterThanOrEqual(
            3200,
          );
        }
      }
    });
  }

  test("long dish names clamp at 390px without horizontal overflow", async ({
    page,
    world,
  }) => {
    const { username, password } = credentials!;
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, username, password);
    await page.goto(`/?week=${world.weeks[0]}`);

    const longName = "红烧糖醋排骨狮子头番茄炒蛋家常大菜";
    const heading = page
      .locator("ul.dish-grid > li")
      .filter({
        has: page.locator(`[data-recipe-for="${world.dishes[0]!.id}"]`),
      })
      .getByRole("heading", { level: 3 });
    await expect(heading).toBeVisible();
    await heading.evaluate((node, name) => {
      node.textContent = name;
    }, longName);

    const clamped = await heading.evaluate((node) => {
      const style = getComputedStyle(node);
      const doc = document.documentElement;
      return {
        lineClamp: style.getPropertyValue("-webkit-line-clamp"),
        overflow: style.overflow,
        lines: node.getClientRects().length,
        headingOverflow: node.scrollWidth - node.clientWidth,
        pageOverflow: doc.scrollWidth - doc.clientWidth,
      };
    });
    expect(clamped.lineClamp).toBe("2");
    expect(clamped.overflow).toBe("hidden");
    expect(clamped.lines).toBeLessThanOrEqual(2);
    expect(clamped.headingOverflow).toBeLessThanOrEqual(1);
    expect(clamped.pageOverflow).toBeLessThanOrEqual(1);
  });
});

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

async function firstRowCount(grid: Locator) {
  return grid.evaluate((node) => {
    const items = [...node.children];
    const first = items[0];
    if (!(first instanceof HTMLElement)) return 0;
    const top = first.getBoundingClientRect().top;
    return items.filter((item) => {
      if (!(item instanceof HTMLElement)) return false;
      return Math.abs(item.getBoundingClientRect().top - top) < 2;
    }).length;
  });
}
