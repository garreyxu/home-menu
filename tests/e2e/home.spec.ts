import { expect, test } from "@playwright/test";
import { e2eCredentials, login } from "./credentials";

const credentials = e2eCredentials();

test("home page loads", async ({ page }) => {
  test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");
  const { username, password } = credentials!;

  await login(page, username, password);

  await expect(page).toHaveTitle("家庭菜单");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(
    page.getByRole("heading", { name: "家庭菜单 · 建设中" }),
  ).toBeVisible();
});
