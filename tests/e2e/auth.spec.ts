import { expect, test } from "@playwright/test";
import { e2eCredentials } from "./credentials";

const credentials = e2eCredentials();

test("unauthenticated API request returns 401", async ({ request }) => {
  const response = await request.get("/api/dishes");
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: "Unauthorized" });
});

test("unauthenticated API path with an image extension returns 401", async ({
  request,
}) => {
  const response = await request.get("/api/photos/x.webp");
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: "Unauthorized" });
});

test("unauthenticated image path outside /assets redirects to /login", async ({
  page,
}) => {
  await page.goto("/foo.png");

  await expect(page).toHaveURL(/\/login/);
  const url = new URL(page.url());
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("next")).toBe("/foo.png");
});

test("unauthenticated visit to / redirects to /login", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login/);
  const url = new URL(page.url());
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("next")).toBe("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
});

test.describe("credential login", () => {
  test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");

  test("wrong password shows a generic error", async ({ page }) => {
    const { username, password } = credentials!;
    const wrong =
      password === "wrong-password" ? "still-wrong" : "wrong-password";

    await page.goto("/login");
    await page.getByLabel("用户名").fill(username);
    await page.getByLabel("密码").fill(wrong);
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page.getByText("用户名或密码不对")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("correct login reaches / and logout returns to /login", async ({
    page,
  }) => {
    const { username, password } = credentials!;

    await page.goto("/login?next=%2F");
    await page.getByLabel("用户名").fill(username);
    await page.getByLabel("密码").fill(password);
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "家庭菜单 · 建设中" }),
    ).toBeVisible();

    const logoutForm = page.locator('form[action="/logout"]');
    await expect(logoutForm).toHaveAttribute("method", "post");
    await logoutForm.getByRole("button", { name: "退出" }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(new URL(page.url()).pathname).toBe("/login");

    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });
});
