import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { menuItems, weeklyMenus } from "@/server/db/schema";
import { writeCustomMenuItem } from "@/server/menu";

const mock = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/server/db", () => ({ getDb: mock.getDb }));
const week = { id: "week", weekStart: "2026-01-04" };
let slotItems: { id: string; customName: string | null }[];
let failure: unknown;
let writes: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mock-stored-path");
  slotItems = [];
  failure = undefined;
  writes = vi.fn(async () => {
    if (failure) throw failure;
    return [{ id: "saved" }];
  });
  const write = () => ({
    set: () => ({ where: () => ({ returning: writes }) }),
  });
  mock.getDb.mockReturnValue({
    insert: (table: unknown) => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: table === weeklyMenus ? async () => [week] : writes,
        }),
      }),
    }),
    update: write,
    select: () => ({
      from: (table: unknown) => ({
        innerJoin: () => ({ where: () => ({ limit: async () => [week] }) }),
        where: async () => (table === menuItems ? slotItems : [week]),
      }),
    }),
  });
});
afterEach(() => vi.unstubAllEnvs());
const add = (name: string, id?: string) =>
  writeCustomMenuItem({
    weekStart: week.weekStart,
    day: 1,
    meal: "lunch",
    name,
    id,
  });
describe("stored custom writes", () => {
  it.each(["寿司外卖", "Takeout"])(
    "rejects trimmed and case folded duplicates before writing: %s",
    async (name) => {
      slotItems = [{ id: "existing", customName: name }];
      await expect(add(` ${name.toUpperCase()} `)).resolves.toEqual({
        weekStart: week.weekStart,
        created: false,
      });
      expect(writes).not.toHaveBeenCalled();
    },
  );
  it("allows a rename to keep its own name, but rejects another row's name", async () => {
    slotItems = [{ id: "self", customName: "Takeout" }];
    expect((await add(" takeout ", "self")).created).toBe(true);
    writes.mockClear();
    slotItems.push({ id: "other", customName: "Pizza" });
    expect((await add(" PIZZA ", "self")).created).toBe(false);
    expect(writes).not.toHaveBeenCalled();
  });
  it("permits different custom names in the same slot", async () => {
    slotItems = [{ id: "existing", customName: "Pizza" }];
    expect((await add("Takeout")).created).toBe(true);
  });
  it("maps a concurrent unique violation on rename to duplicate", async () => {
    failure = { cause: { code: "23505" } };
    expect((await add("Takeout", "self")).created).toBe(false);
  });
  it("does not swallow unrelated database failures", async () => {
    failure = new Error("write failed");
    await expect(add("Takeout")).rejects.toThrow("write failed");
  });
});
