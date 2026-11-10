import { expect, test } from "@playwright/test";
import { e2eCredentials, login } from "./credentials";

const credentials = e2eCredentials();
test.describe("recipe sheet layout and paper blend", () => {
  test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");
  for (const width of [390, 640, 1440, 3440]) {
    test(`sheet layout at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page, credentials!.username, credentials!.password);
      const card = page.locator("ul.dish-grid > li").first();
      await card.locator(".dish-recipe-entry").click();
      const dialog = page.locator(".recipe-panel");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("正在打开做法")).toHaveCount(0);
      await expect(
        dialog.locator(".recipe-art img, .recipe-art-fallback"),
      ).toBeVisible();
      await expect(dialog.getByText("做法", { exact: true })).toHaveCount(0);
      await expect(dialog.locator("a")).toHaveCount(0);
      const close = dialog.getByRole("button", { name: "关闭", exact: true });
      await expect(close).toHaveCSS("border-radius", "50%");
      const closeBox = await close.boundingBox();
      expect(closeBox!.width).toBe(40);
      expect(closeBox!.height).toBe(40);
      const box = (await dialog.boundingBox())!;
      if (width < 640) {
        expect(box.x).toBe(0);
        expect(box.y).toBe(0);
        expect(box.width).toBe(width);
        expect(box.height).toBe(900);
      } else {
        expect(box.width).toBeLessThanOrEqual(576);
        expect(box.height).toBeLessThanOrEqual(900 * 0.86 + 1);
        expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(1);
        expect(Math.abs(box.y + box.height / 2 - 450)).toBeLessThan(1);
        const header = await dialog.locator(".recipe-header").boundingBox();
        await dialog.locator(".recipe-scroll").evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        expect(await dialog.locator(".recipe-header").boundingBox()).toEqual(
          header,
        );
      }
      await dialog.getByRole("button", { name: "＋添加", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      if (width >= 1440) await expect(page.locator(".slot-hint")).toBeVisible();
      else
        await expect(
          page.getByRole("dialog", { name: /加到哪一顿/ }),
        ).toBeVisible();
    });
  }
  test("generated illustrations have scoped blend styles", async ({ page }) => {
    await page.setViewportSize({ width: 3440, height: 1440 });
    await login(page, credentials!.username, credentials!.password);
    const art = page.locator("img.dish-art").first();
    test.skip((await art.count()) === 0, "No illustrated cards on this wall");
    await expect(art).toHaveCSS("mix-blend-mode", "multiply");
    await expect(art).not.toHaveCSS("mask-image", "none");
    await expect(art.locator("..")).toHaveCSS("isolation", "isolate");
    await expect(art.locator("..")).not.toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    const thumb = page.locator("img.week-thumb").first();
    if (await thumb.count()) {
      await expect(thumb).toHaveCSS("mix-blend-mode", "multiply");
      await expect(thumb).toHaveCSS("mask-image", "none");
    }
    const fallback = page.locator("span.week-thumb-fallback").first();
    if (await fallback.count()) {
      await expect(fallback).toHaveCSS("mix-blend-mode", "normal");
      await expect(fallback).toHaveCSS("mask-image", "none");
      await expect(fallback).toBeVisible();
    }
  });
});
