import { expect, test } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("家庭菜单");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(
    page.getByRole("heading", { name: "家庭菜单 · 建设中" }),
  ).toBeVisible();
});
