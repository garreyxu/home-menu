import { test, expect, dataAction } from "./fixtures";
import { e2eCredentials, login } from "./credentials";

const credentials = e2eCredentials();

test.describe.configure({ mode: "serial" });

test.describe("cocktail menu", () => {
  test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");

  test("opens 酒单 from the main nav and shows the empty state", async ({
    page,
    dataRequest,
  }) => {
    const { username, password } = credentials!;
    await dataAction(dataRequest, "cleanup-drink");
    await login(page, username, password);
    await page
      .getByRole("navigation", { name: "主菜单" })
      .getByRole("link", { name: "酒单" })
      .click();
    await expect(page).toHaveURL(/\/drinks$/);
    await expect(
      page.getByRole("navigation", { name: "主菜单" }).getByRole("link", {
        name: "酒单",
      }),
    ).toHaveAttribute("aria-current", "page");

    const cards = page.locator("[data-drink-card]");
    if (!process.env.PLAYWRIGHT_BASE_URL) {
      await expect(cards).toHaveCount(0);
      await expect(page.getByText("酒单还空着，等家里添几杯。")).toBeVisible();
    } else if ((await cards.count()) === 0) {
      await expect(page.getByText("酒单还空着，等家里添几杯。")).toBeVisible();
    }
  });

  test("shows a seeded drink card, base filter, and detail", async ({
    page,
    dataRequest,
  }) => {
    const { username, password } = credentials!;
    const seeded = await dataAction(dataRequest, "seed-drink");
    expect(seeded.status(), "drink seed status").toBe(200);
    const drink = (await seeded.json()) as {
      id: string;
      name: string;
      baseSpirit: string;
      ingredients: string;
      sourceUrl: string;
      step: string;
    };
    try {
      await login(page, username, password);
      await page.goto("/drinks");
      const card = page.locator(`[data-drink-card="${drink.id}"]`);
      await expect(card).toBeVisible();
      await expect(
        card.getByRole("link", { name: `打开${drink.name}` }),
      ).toBeVisible();
      await expect(card.getByRole("list", { name: "基酒" })).toContainText(
        drink.baseSpirit,
      );
      await expect(card.getByText("已尝试")).toBeVisible();
      await expect(card.getByRole("img", { name: /还没有插画/ })).toBeVisible();
      await expect(card).not.toContainText("notion.so");
      await expect(card).not.toContainText("amazonaws");

      await page
        .getByRole("navigation", { name: "基酒" })
        .getByRole("link", { name: drink.baseSpirit, exact: true })
        .click();
      await expect(page).toHaveURL(/base=/);
      await expect(card).toBeVisible();

      for (const viewport of [
        { width: 390, height: 844 },
        { width: 1440, height: 900 },
        { width: 3440, height: 1440 },
      ]) {
        await page.setViewportSize(viewport);
        await expect(card).toBeVisible();
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        );
        expect(
          overflow,
          `horizontal overflow at ${viewport.width}`,
        ).toBeLessThanOrEqual(1);
      }

      await card.getByRole("link", { name: `打开${drink.name}` }).click();
      await expect(page).toHaveURL(new RegExp(`/drinks/${drink.id}$`));
      await expect(
        page.getByRole("heading", { name: drink.name }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: "配料" })).toBeVisible();
      await expect(page.getByText(drink.ingredients)).toBeVisible();
      await expect(page.getByRole("heading", { name: "步骤" })).toBeVisible();
      await expect(page.getByText(drink.step)).toBeVisible();
      const source = page.getByRole("link", { name: "出处" });
      await expect(source).toHaveAttribute("href", drink.sourceUrl);
      await expect(source).toHaveAttribute("target", "_blank");
      await expect(source).toHaveAttribute("rel", "noopener noreferrer");

      await page.getByRole("link", { name: "返回酒单" }).click();
      await expect(page).toHaveURL(/\/drinks/);
      await page
        .getByRole("navigation", { name: "主菜单" })
        .getByRole("link", { name: "菜单" })
        .click();
      await expect(page).toHaveURL(/\/$/);
      await expect(
        page.getByRole("heading", { name: "御膳房", level: 1 }),
      ).toBeVisible();
    } finally {
      const cleanup = await dataAction(dataRequest, "cleanup-drink");
      expect(cleanup.status(), "drink cleanup status").toBe(200);
    }
  });
});
