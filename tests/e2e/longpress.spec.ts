import { slotButton } from "./slots";
import { mkdir } from "node:fs/promises";
import {
  test,
  expect,
  persistMenuAction,
  cleanupWorldAfterEach,
} from "./fixtures";
import { e2eCredentials, login } from "./credentials";

test.use({ hasTouch: true, viewport: { width: 390, height: 660 } });
cleanupWorldAfterEach();

test("long-press sheet buttons fit the 390x660 touch viewport", async ({
  page,
  world,
}, testInfo) => {
  const credentials = e2eCredentials();
  test.skip(!credentials, "E2E credentials are not set");
  expect(Number(world.weeks[0].slice(0, 4))).toBeGreaterThanOrEqual(2090);
  await login(page, credentials!.username, credentials!.password);
  await page.goto(`/?week=${world.weeks[0]}`);
  const tray = page.getByRole("button", { name: /本周已点 \d+ 道/ });
  if ((await tray.getAttribute("aria-expanded")) !== "true") await tray.click();
  const board = page.locator("#week-tray-panel");
  await board
    .getByRole("button", { name: "＋ 自定义（外卖、聚餐…）", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "自定义条目", exact: true });
  await editor.getByRole("textbox").fill("寿司外卖");
  await slotButton(editor, "周一午餐").click();
  await persistMenuAction(page, () =>
    editor.getByRole("button", { name: "放进去", exact: true }).click(),
  );
  await expect(editor).toHaveCount(0);
  const chip = board
    .locator(".week-custom-chip")
    .filter({ hasText: "寿司外卖" });
  await chip.scrollIntoViewIfNeeded();
  const box = (await chip.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await page.waitForTimeout(400);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
  const sheet = page.locator(".week-press-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button")).toHaveText([
    "移到…",
    "改名",
    "从这顿删掉",
    "取消",
  ]);
  for (const button of await sheet.getByRole("button").all()) {
    await expect(button).toBeInViewport({ ratio: 1 });
    const rect = (await button.boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(390);
    expect(rect.y + rect.height).toBeLessThanOrEqual(660);
  }
  await mkdir("preview-screenshots", { recursive: true });
  const path = "preview-screenshots/longpress-menu-390.png";
  await page.screenshot({ path });
  await testInfo.attach("longpress-menu-390", {
    path,
    contentType: "image/png",
  });
});
