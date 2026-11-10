import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";
import { claimedWeekId, cleanupE2E } from "@/server/e2e-data";
const mock = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/server/db", () => ({ getDb: mock.getDb }));
const runId = "42841939316-1";
const weekStart = "2090-01-01";
const id = claimedWeekId(runId, weekStart, "spec");
const statements: { query: string; params: unknown[] }[] = [];
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "stub-stored");
  statements.length = 0;
  // Compile real Drizzle SQL, and model restrictive foreign keys (no cascade).
  let children = true;
  let dish = true;
  mock.getDb.mockReturnValue(
    drizzle(async (query, params) => {
      statements.push({ query, params });
      if (query.startsWith('select "id", "week_start"'))
        return {
          rows: [
            [id, weekStart, "2026-11-10T00:00:00Z"],
            [crypto.randomUUID(), "2090-01-08", "2026-11-10T00:00:00Z"],
          ],
        };
      if (query.startsWith('delete from "menu_items"')) children = false;
      if (query.startsWith('delete from "weekly_menus"') && children)
        throw { code: "23503" };
      if (query.startsWith('delete from "dishes"')) {
        if (children) throw { code: "23503" };
        dish = false;
      }
      if (query.startsWith('delete from "categories"') && dish)
        throw { code: "23503" };
      return { rows: [] };
    }),
  );
});
afterEach(() => vi.unstubAllEnvs());
it("deletes run-scoped children, owned weeks, tagged dishes, then category", async () => {
  await cleanupE2E(runId);
  const deletes = statements.filter((s) => s.query.startsWith("delete"));
  expect(deletes.map((s) => s.query.split('"')[1])).toEqual([
    "menu_items",
    "menu_items",
    "weekly_menus",
    "dishes",
    "categories",
  ]);
  const taggedItems = deletes[0];
  expect(taggedItems.query).toContain('"menu_items"."dish_id" in (select');
  expect(taggedItems.query).toContain('"dishes"."notion_page_id" ~');
  expect(taggedItems.params).toEqual([
    "2090-01-01",
    "2099-12-27",
    `^e2e:${runId}:[1-9][0-9]*$`,
  ]);
  expect(deletes[1].params).toEqual([id, weekStart]);
  expect(deletes[2].params).toEqual([id, weekStart]);
  expect(deletes[3].params).toEqual([`^e2e:${runId}:[1-9][0-9]*$`]);
  expect(deletes[4].params).toEqual([`e2e-${runId}`]);
  // The unrelated reserved week is not treated as an owned parent.
  expect(deletes.slice(1).flatMap((s) => s.params)).not.toContain("2090-01-08");
});
it("fixture cleanup only deletes the requested owned week, keeping shared dishes", async () => {
  await cleanupE2E(runId, [weekStart]);
  expect(
    statements
      .filter((s) => s.query.startsWith("delete"))
      .map((s) => s.query.split('"')[1]),
  ).toEqual(["menu_items", "weekly_menus"]);
  await cleanupE2E(runId, ["2090-01-08"]);
  expect(statements.filter((s) => s.query.startsWith("delete"))).toHaveLength(
    2,
  );
});
it("retains age, young-item and run-prefix predicates during stale sweeps", async () => {
  const cutoff = new Date("2026-11-10T12:00:00Z");
  await cleanupE2E(runId, undefined, cutoff);
  const deletes = statements.filter((s) => s.query.startsWith("delete"));
  expect(deletes[0].query).toContain('"menu_items"."created_at" <');
  expect(deletes[1].query).toContain(
    'not exists (select 1 from "menu_items" young',
  );
  expect(deletes[2].query).toContain('not exists (select 1 from "menu_items"');
  expect(deletes[3].query).toContain('not exists (select 1 from "menu_items"');
  expect(deletes[4].query).toContain('not exists (select 1 from "dishes"');
});
