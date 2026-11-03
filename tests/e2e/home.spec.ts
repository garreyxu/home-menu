import { expect, test } from "@playwright/test";
import { e2eCredentials, login } from "./credentials";

const credentials = e2eCredentials();

test.describe("dish wall", () => {
  test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");

  test("renders dishes and filters by category link", async ({ page }) => {
    const { username, password } = credentials!;
    await login(page, username, password);

    await expect(page).toHaveTitle("我家海上食堂");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(
      page.getByRole("heading", { name: "我家海上食堂", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "番茄炒蛋" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "紫菜蛋花汤" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "+加到哪天" })).toHaveCount(
      0,
    );

    const soup = page.getByRole("link", { name: "汤品" });
    await expect(soup).toHaveAttribute("href", /\?category=/);
    await soup.click();

    await expect(page).toHaveURL(/category=/);
    await expect(
      page.getByRole("heading", { name: "紫菜蛋花汤" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "番茄炒蛋" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: "汤品" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await page.getByRole("link", { name: "全部" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "番茄炒蛋" })).toBeVisible();
  });

  test("category query is linkable", async ({ page }) => {
    const { username, password } = credentials!;
    await login(page, username, password);

    await page.goto("/?category=" + encodeURIComponent("家常菜"));
    await expect(page.getByRole("heading", { name: "红烧肉" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "紫菜蛋花汤" })).toHaveCount(
      0,
    );

    await page.goto("/?category=" + encodeURIComponent("没有的分类"));
    await expect(page.getByText("没有这个分类。")).toBeVisible();
    await expect(page.getByRole("heading", { name: "红烧肉" })).toHaveCount(0);
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

      const card = page.getByRole("main").getByRole("listitem").first();
      await expect(card).toBeVisible();
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      if (viewport.name === "mobile") {
        expect(box!.width).toBeGreaterThan(120);
        expect(box!.width).toBeLessThan(220);
      } else {
        expect(box!.width).toBeGreaterThan(240);
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
      } else {
        expect(nav!.x).toBeLessThan(main!.x);
        expect(nav!.width).toBeGreaterThan(180);
        expect(nav!.width).toBeLessThan(260);
      }

      if (viewport.name === "ultrawide") {
        expect(nav!.x).toBeLessThanOrEqual(120);
        expect(viewport.width - (main!.x + main!.width)).toBeLessThanOrEqual(
          120,
        );
        expect(main!.x + main!.width - nav!.x).toBeGreaterThanOrEqual(3200);
      }
    });
  }
});
