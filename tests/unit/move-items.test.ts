import { beforeEach, describe, expect, it } from "vitest";
import {
  addMenuItem,
  clearEphemeralWeeklyMenu,
  getWeek,
  moveStoredMenuItem,
  writeCustomMenuItem,
} from "@/server/menu";
import { sampleDishCatalog } from "@/server/sample-catalog";
import { moveDuplicate } from "@/lib/move-item";
const week = "2026-01-04";
const dishId = sampleDishCatalog()[0].dishes[0].id;
beforeEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.VERCEL_ENV;
  clearEphemeralWeeklyMenu();
});
describe("moving week items", () => {
  it("moves only the item location and treats the same cell as a no-op", async () => {
    const { item } = await addMenuItem({
      weekStart: week,
      dayOfWeek: 1,
      meal: "lunch",
      dishId,
    });
    await moveStoredMenuItem(item.id, week, 1, "lunch");
    expect((await getWeek(week))!.items).toHaveLength(1);
    await moveStoredMenuItem(item.id, week, 3, "dinner");
    expect((await getWeek(week))!.items[0]).toMatchObject({
      id: item.id,
      dayOfWeek: 3,
      meal: "dinner",
      dishId,
    });
  });
  it("rejects invalid days, meals, missing ids and other weeks", async () => {
    const { item } = await addMenuItem({
      weekStart: week,
      dayOfWeek: 1,
      meal: "lunch",
      dishId,
    });
    for (const [id, start, day, meal] of [
      [item.id, week, 7, "lunch"],
      [item.id, week, 2, "snack"],
      ["missing", week, 2, "lunch"],
      [item.id, "2026-01-11", 2, "lunch"],
    ] as const) {
      await expect(moveStoredMenuItem(id, start, day, meal)).rejects.toThrow();
    }
    expect((await getWeek(week))!.items[0].dayOfWeek).toBe(1);
  });
  it("rejects duplicate dishes without changing either item", async () => {
    const { item } = await addMenuItem({
      weekStart: week,
      dayOfWeek: 1,
      meal: "lunch",
      dishId,
    });
    await addMenuItem({
      weekStart: week,
      dayOfWeek: 3,
      meal: "dinner",
      dishId,
    });
    await expect(
      moveStoredMenuItem(item.id, week, 3, "dinner"),
    ).rejects.toThrow("这顿已经有了");
    expect((await getWeek(week))!.items.map((i) => i.dayOfWeek)).toEqual([
      1, 3,
    ]);
  });
  it("compares custom names case-insensitively with trimmed whitespace", async () => {
    await writeCustomMenuItem({
      weekStart: week,
      name: "Takeout",
      day: 1,
      meal: "lunch",
    });
    await writeCustomMenuItem({
      weekStart: week,
      name: "TAKEOUT",
      day: 3,
      meal: "dinner",
    });
    const items = (await getWeek(week))!.items;
    expect(
      moveDuplicate(
        items,
        { ...items[0], customName: " takeout " },
        3,
        "dinner",
      ),
    ).toBe(true);
    await expect(
      moveStoredMenuItem(items[0].id, week, 3, "dinner"),
    ).rejects.toThrow("这顿已经有了");
    await moveStoredMenuItem(items[0].id, week, 2, "breakfast");
    expect((await getWeek(week))!.items).toHaveLength(2);
  });
});
