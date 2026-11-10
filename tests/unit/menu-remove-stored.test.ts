import { afterEach, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";
import { removeMenuItem } from "@/server/menu";
import { claimedWeekId } from "@/server/e2e-data";
const mock = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/server/db", () => ({ getDb: mock.getDb }));
afterEach(() => vi.unstubAllEnvs());

it.each([
  ["2026-01-04", "f5f42723-c438-4bfb-9764-a876ac212548"],
  ["2090-01-01", "f5f42723-c438-4bfb-9764-a876ac212548"],
  ["2090-01-01", claimedWeekId("probe-run", "2090-01-01", "test")],
])(
  "stored removes use the same exact slot predicates for %s (%s)",
  async (weekStart, weekId) => {
    vi.stubEnv("DATABASE_URL", "stub-stored");
    const dishId = "01770d35-677c-4076-9e92-b73e800e602b";
    const queries: { query: string; params: unknown[] }[] = [];
    mock.getDb.mockReturnValue(
      drizzle(async (query, params) => {
        queries.push({ query, params });
        if (query.includes('from "dishes"'))
          return { rows: [[dishId, "番茄炒蛋"]] };
        if (query.includes('from "weekly_menus"')) return { rows: [[weekId]] };
        if (query.startsWith('delete from "menu_items"'))
          return { rows: [["removed-item"]] };
        throw new Error("Unexpected query in remove");
      }),
    );
    expect(
      await removeMenuItem({ weekStart, dayOfWeek: 2, meal: "dinner", dishId }),
    ).toEqual({ removed: true });
    expect(queries[1].params).toEqual([weekStart, 1]);
    expect(queries[2].params).toEqual([weekId, 2, "dinner", dishId]);
    expect(queries[2].query).toContain('"menu_items"."weekly_menu_id" = $1');
    expect(queries[2].query).toContain('"menu_items"."dish_id" = $4');
  },
);
