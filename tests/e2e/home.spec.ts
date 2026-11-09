import { expect, test, type Locator } from "@playwright/test";
import { e2eCredentials, login } from "./credentials";
import { readWall } from "./wall";

const credentials = e2eCredentials();

/**
 * One stamp per card. Dishes already on the viewed week say "已加 N 次"
 * instead of "＋添加". Preview Neon branches copy production, and the
 * seed never writes week menus, so the current week may already be filled.
 */
function wallStamps(wall: Locator): Locator {
  return wall.getByRole("button", {
    name: /^(＋添加|已加 \d+ 次)$/,
  });
}

test.describe("dish wall", () => {
  test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");

  test("renders dishes and filters by category link", async ({ page }) => {
    const { username, password } = credentials!;
    await login(page, username, password);

    await expect(page).toHaveTitle("御膳房");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(
      page.getByRole("heading", { name: "御膳房", level: 1 }),
    ).toBeVisible();
    const dishes = await readWall(page);
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

    const category = navCategories[0] ?? dishes[0]!.category;
    const outsider = dishes.find((dish) => dish.category !== category);
    const categoryLink = nav.getByRole("link", {
      name: category,
      exact: true,
    });
    await expect(categoryLink).toHaveAttribute("href", /\?category=/);
    await categoryLink.click();

    await expect(page).toHaveURL(/category=/);
    const filtered = await readWall(page);
    expect(filtered.every((dish) => dish.category === category)).toBe(true);
    if (outsider) {
      await expect(
        page.getByRole("heading", { name: outsider.name, exact: true }),
      ).toHaveCount(0);
    }
    await expect(wallStamps(wall)).toHaveCount(filtered.length);
    await expect(categoryLink).toHaveAttribute("aria-current", "page");

    await page.getByRole("link", { name: "全部", exact: true }).click();
    await expect(page).toHaveURL("/");
    const restored = await readWall(page);
    expect(restored).toHaveLength(dishes.length);
    await expect(wallStamps(wall)).toHaveCount(dishes.length);
  });

  test("category query is linkable", async ({ page }) => {
    const { username, password } = credentials!;
    await login(page, username, password);

    const dishes = await readWall(page);
    const category = dishes[0]!.category;
    const outsider = dishes.find((dish) => dish.category !== category);

    await page.goto("/?category=" + encodeURIComponent(category));
    const filtered = await readWall(page);
    expect(filtered.every((dish) => dish.category === category)).toBe(true);
    if (outsider) {
      await expect(
        page.getByRole("heading", { name: outsider.name, exact: true }),
      ).toHaveCount(0);
    }

    await page.goto("/?category=" + encodeURIComponent("没有的分类"));
    await expect(page.getByText("没有这个分类。")).toBeVisible();
    await expect(
      page.locator("ul.dish-grid").getByRole("listitem"),
    ).toHaveCount(0);
    await expect(page.locator("[aria-current='page']")).toHaveCount(0);
  });

  const viewports = [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 900 },
    { name: "ultrawide", width: 3440, height: 1440 },
  ] as const;

  for (const viewport of viewports) {
    test(`layout stays intentional at ${viewport.name}`, async ({ page }) => {
      const { username, password } = credentials!;
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await login(page, username, password);

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth - doc.clientWidth;
      });
      expect(overflow).toBeLessThanOrEqual(1);

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
      } else {
        expect(box!.width).toBeGreaterThan(200);
        expect(box!.width).toBeLessThan(420);
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
            };
          });
        expect(scrolling.overflowX).toBe("auto");
        expect(scrolling.direction).toBe("row");
        expect(scrolling.wrap).toBe("nowrap");
      } else {
        expect(nav!.x).toBeLessThan(main!.x);
        expect(nav!.width).toBeGreaterThan(180);
        expect(nav!.width).toBeLessThan(260);
      }

      const board = page.getByRole("region", { name: "一周菜单" });
      if (viewport.name === "mobile") {
        await expect(
          page.getByRole("button", { name: /本周已点 \d+ 道/ }),
        ).toBeVisible();
        await expect(board).toHaveCount(0);
      } else {
        await expect(board).toBeVisible();
        const boardBox = await board.boundingBox();
        expect(boardBox).not.toBeNull();
        expect(boardBox!.x).toBeGreaterThan(main!.x);
        if (viewport.name === "desktop") {
          expect(boardBox!.width).toBeGreaterThanOrEqual(376);
          expect(boardBox!.width).toBeLessThanOrEqual(384);
        }
        if (viewport.name === "ultrawide") {
          expect(nav!.x).toBeLessThanOrEqual(120);
          expect(
            viewport.width - (boardBox!.x + boardBox!.width),
          ).toBeLessThanOrEqual(120);
          expect(boardBox!.x + boardBox!.width - nav!.x).toBeGreaterThanOrEqual(
            3200,
          );
          expect(boardBox!.width).toBeGreaterThanOrEqual(560);
          expect(boardBox!.width).toBeLessThanOrEqual(640);
        }
      }
    });
  }

  test("long dish names clamp at 390px without horizontal overflow", async ({
    page,
  }) => {
    const { username, password } = credentials!;
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, username, password);

    const longName = "红烧糖醋排骨狮子头番茄炒蛋家常大菜";
    const heading = page.locator("ul.dish-grid h3.dish-name").first();
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
