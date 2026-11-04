import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { e2eCredentials, login } from "./credentials";

const credentials = e2eCredentials();

const widths = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
  { width: 3440, height: 1440 },
] as const;

test("signed-in dish wall screenshots", async ({ page }) => {
  test.skip(
    !process.env.PREVIEW_SCREENSHOTS,
    "preview screenshots run only in preview-e2e",
  );
  test.skip(!credentials, "E2E_USERNAME and E2E_PASSWORD are not set");
  const { username, password } = credentials!;

  await login(page, username, password);
  await mkdir("preview-screenshots", { recursive: true });

  for (const viewport of widths) {
    await page.setViewportSize(viewport);
    await page.goto("/");
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
