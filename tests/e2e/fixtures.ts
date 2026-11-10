import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { e2eCredentials } from "./credentials";

export type World = {
  runId: string;
  weeks: string[];
  dishes: { id: string; name: string; category: string; hasRecipe: boolean }[];
};
export async function dataAction(
  request: APIRequestContext,
  action: string,
  fields: Record<string, unknown> = {},
) {
  const runId = process.env.E2E_RUN_ID!;
  return request.post("/api/e2e", {
    headers: { "x-e2e-run": runId },
    data: { action, runId, ...fields },
  });
}
export const test = base.extend<{
  world: World;
  dataRequest: APIRequestContext;
}>({
  dataRequest: async ({ browser, playwright, hasTouch }, provide, info) => {
    const credentials = e2eCredentials();
    if (!credentials) {
      await provide(undefined as never);
      return;
    }
    const context = await browser.newContext({ hasTouch });
    // Separate login contexts inherit protection headers and the test touch mode.
    const config = info.project.use;
    await context.setExtraHTTPHeaders(config.extraHTTPHeaders ?? {});
    const page = await context.newPage();
    await page.goto(`${config.baseURL}/login`);
    await page.getByLabel("用户名").fill(credentials.username);
    await page.getByLabel("密码").fill(credentials.password);
    await page.getByRole("button", { name: "开门" }).click();
    await expect(page).toHaveURL(`${config.baseURL}/`);
    const request = await playwright.request.newContext({
      baseURL: config.baseURL,
      extraHTTPHeaders: config.extraHTTPHeaders,
      storageState: await context.storageState(),
    });
    await context.close();
    try {
      await provide(request);
    } finally {
      await request.dispose();
    }
  },
  world: async ({ dataRequest }, provide, info) => {
    test.skip(!e2eCredentials(), "E2E_USERNAME and E2E_PASSWORD are not set");
    let world: World | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await dataAction(dataRequest, "seed", {
        label: info.testId,
        attempt,
      });
      if (response.status() === 409) continue;
      expect(response.status(), "test data seed status").toBe(200);
      world = await response.json();
      world!.weeks.reverse(); // primary week and its claimed previous week
      break;
    }
    expect(
      world,
      "Could not claim isolated test weeks in five attempts",
    ).toBeDefined();
    try {
      await provide(world!);
    } finally {
      const response = await dataAction(dataRequest, "cleanup", {
        weeks: world!.weeks,
      });
      expect(response.status(), "fixture cleanup status").toBe(200);
    }
  },
});
export { expect };
