import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanupE2E, leftoversE2E, seedE2E } from "@/server/e2e-data";
type StoredWeek = {
  id: string;
  weekStart: string;
  createdAt: Date;
  items: unknown[];
};
const scope = globalThis as typeof globalThis & {
  __homeMenuEphemeralWeeks?: Map<string, StoredWeek>;
  __homeMenuE2ELeases?: Map<string, number>;
};
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  scope.__homeMenuEphemeralWeeks = new Map();
  scope.__homeMenuE2ELeases = new Map();
});
afterEach(() => {
  vi.unstubAllEnvs();
  delete scope.__homeMenuEphemeralWeeks;
  delete scope.__homeMenuE2ELeases;
});
it("rejects real weeks, preserves unrelated data, and claims idempotently", async () => {
  scope.__homeMenuEphemeralWeeks!.set("2026-12-27", {
    id: "real",
    weekStart: "2026-12-27",
    createdAt: new Date(),
    items: [],
  });
  await expect(seedE2E("run-1234", ["2026-12-27"])).rejects.toThrow();
  const world = await seedE2E("run-1234", ["2090-01-01"], 6, "a");
  expect(world!.dishes).toHaveLength(6);
  expect(world!.dishes.some((d) => d.hasRecipe)).toBe(true);
  expect(await seedE2E("run-1234", ["2090-01-01"], 6, "a")).toEqual(world);
  expect(await seedE2E("other-run", ["2090-01-01"], 6, "a")).toBeNull();
  expect(await seedE2E("run-1234", ["2090-01-01"], 6, "b")).toBeNull();
  await cleanupE2E("other-run", ["2090-01-01"]);
  expect((await leftoversE2E("run-1234")).weeks).toBe(1);
  await cleanupE2E("run-1234");
  await cleanupE2E("run-1234");
  expect(await leftoversE2E("run-1234")).toEqual({
    weeks: 0,
    dishes: 0,
    categories: 0,
  });
  expect(scope.__homeMenuEphemeralWeeks!.get("2026-12-27")!.id).toBe("real");
});
it("sweeps only old other runs and preserves young overlapping runs", async () => {
  await seedE2E("old-run", ["2090-01-01"], 6, "a");
  await seedE2E("young-run", ["2090-01-08"], 6, "a");
  scope.__homeMenuE2ELeases!.set("old-run", Date.now() - 7 * 3600_000);
  scope.__homeMenuEphemeralWeeks!.get("2090-01-01")!.createdAt = new Date(
    Date.now() - 7 * 3600_000,
  );
  await seedE2E("current-run", ["2090-01-15"], 6, "a");
  expect((await leftoversE2E("old-run")).weeks).toBe(0);
  expect((await leftoversE2E("young-run")).weeks).toBe(1);
});

it("does not sweep young items appended to an old claim", async () => {
  await seedE2E("old-run", ["2090-01-01"], 6, "a");
  scope.__homeMenuE2ELeases!.set("old-run", Date.now() - 7 * 3600_000);
  const row = scope.__homeMenuEphemeralWeeks!.get("2090-01-01")!;
  row.createdAt = new Date(Date.now() - 7 * 3600_000);
  row.items.push({ createdAt: new Date() });
  await seedE2E("current-run", ["2090-01-15"], 6, "a");
  expect((await leftoversE2E("old-run")).weeks).toBe(1);
});
