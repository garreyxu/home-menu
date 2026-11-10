import {
  test as base,
  expect,
  type Page,
  type Request,
  type APIRequestContext,
} from "@playwright/test";
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

const mutations = new WeakMap<Page, Set<Request>>();
const isAction = (request: Request) =>
  request.method() === "POST" &&
  !!request.headers()["next-action"] &&
  (/"meal"\s*:/.test(request.postData() ?? "") ||
    /"\d{4}-\d{2}-\d{2}"/.test(request.postData() ?? ""));

/** Wait for actual server responses and React's queued menu action work. */
export async function waitForMenuActions(page: Page) {
  const active = mutations.get(page);
  if (!active || page.isClosed()) return;
  do {
    await Promise.all(
      [...active].map(async (request) => {
        if (request.failure()) {
          active.delete(request);
          return;
        }
        const response = await request.response();
        if (response)
          expect(response.status(), "menu action response").toBe(200);
        active.delete(request);
      }),
    );
    if (page.isClosed()) return;
    await page.evaluate(
      () => new Promise<void>((resolve) => window.setTimeout(resolve, 0)),
    );
  } while (active.size);
}

export async function persistMenuAction(
  page: Page,
  trigger: () => Promise<unknown>,
) {
  await waitForMenuActions(page);
  const [response] = await Promise.all([
    page.waitForResponse((response) => isAction(response.request())),
    trigger(),
  ]);
  expect(response.status(), "menu mutation HTTP status").toBe(200);
  // Next's action handler awaits the action before generating its response.
  // Revalidated RSC streams may remain open in dev: await the response, not EOF.
  await waitForMenuActions(page);
}

export const test = base.extend<{
  world: World;
  dataRequest: APIRequestContext;
}>({
  page: async ({ page }, provide) => {
    const active = new Set<Request>();
    mutations.set(page, active);
    const started = (request: Request) => {
      if (isAction(request)) active.add(request);
    };
    const finished = (request: Request) => active.delete(request);
    page.on("request", started);
    const responded = (response: import("@playwright/test").Response) =>
      finished(response.request());
    page.on("response", responded);
    page.on("requestfinished", finished);
    page.on("requestfailed", finished);
    try {
      await provide(page);
    } finally {
      await waitForMenuActions(page);
      page.off("request", started);
      page.off("response", responded);
      page.off("requestfinished", finished);
      page.off("requestfailed", finished);
      mutations.delete(page);
    }
  },
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
  world: async ({ dataRequest, page }, provide, info) => {
    test.skip(!e2eCredentials(), "E2E_USERNAME and E2E_PASSWORD are not set");
    let world: World | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await dataAction(dataRequest, "seed", {
        label: `${info.testId}:retry-${info.retry}`,
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
      await waitForMenuActions(page);
      const response = await dataAction(dataRequest, "cleanup", {
        weeks: world!.weeks,
      });
      expect(response.status(), "fixture cleanup status").toBe(200);
    }
  },
});
export { expect };

/** Writing specs explicitly release each attempt before Playwright can retry it. */
export function cleanupWorldAfterEach() {
  test.afterEach(async ({ world, dataRequest, page }) => {
    try {
      await waitForMenuActions(page);
    } finally {
      const response = await dataAction(dataRequest, "cleanup", {
        weeks: world.weeks,
      });
      expect(response.status(), "afterEach cleanup status").toBe(200);
    }
  });
}
