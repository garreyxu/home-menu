import { test, expect } from "@playwright/test";
import { e2eCredentials, login } from "./credentials";
import { dataAction } from "./fixtures";

test("removes every run row and proves there are no leftovers", async ({
  page,
}) => {
  test.skip(!e2eCredentials(), "E2E_USERNAME and E2E_PASSWORD are not set");
  const credentials = e2eCredentials()!;
  await login(page, credentials.username, credentials.password);
  expect((await dataAction(page.request, "cleanup")).status()).toBe(200);
  const response = await dataAction(page.request, "leftovers");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ weeks: 0, dishes: 0, categories: 0 });
});
