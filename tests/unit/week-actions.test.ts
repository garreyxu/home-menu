import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addCustomItem,
  renameCustomItem,
  addDishToSlot,
  removeDishFromSlot,
} from "@/app/week-actions";
import { MENU_ACTION_ERROR } from "@/lib/menu-slots";
import { signSession } from "@/lib/auth/session";
import { clearEphemeralWeeklyMenu } from "@/server/menu";
import { sampleDishCatalog } from "@/server/sample-catalog";
import { loadWeekMenu } from "@/server/week-menu";
import { isSundayWeekStart } from "@/server/week";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("REDIRECT ")) {
      throw error;
    }
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const SECRET = "unit-test-session-secret-not-for-production";
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalVercelEnv = process.env.VERCEL_ENV;
const originalSecret = process.env.SESSION_SECRET;

const dish = sampleDishCatalog()
  .flatMap((category) => category.dishes)
  .find((item) => item.name === "番茄炒蛋");

if (!dish) {
  throw new Error("Sample catalog is missing 番茄炒蛋.");
}

const slot = {
  weekStart: "2026-01-04",
  dayOfWeek: 2,
  meal: "dinner" as const,
  dishId: dish.id,
};

function mockCookie(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: () => (value === undefined ? undefined : { value }),
  } as Awaited<ReturnType<typeof cookies>>);
}

beforeEach(async () => {
  vi.clearAllMocks();
  delete process.env.DATABASE_URL;
  delete process.env.VERCEL_ENV;
  process.env.SESSION_SECRET = SECRET;
  clearEphemeralWeeklyMenu();
  mockCookie(await signSession({ secret: SECRET }));
});

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
  clearEphemeralWeeklyMenu();
});

describe("weekly menu actions", () => {
  it("requires a session before add, remove, or load", async () => {
    mockCookie(undefined);

    await expect(
      addCustomItem({
        weekStart: slot.weekStart,
        day: 1,
        meal: "dinner",
        name: "外卖",
      }),
    ).rejects.toThrow("REDIRECT /login");
    await expect(
      renameCustomItem({
        id: crypto.randomUUID(),
        day: 1,
        meal: "dinner",
        name: "外卖",
      }),
    ).rejects.toThrow("REDIRECT /login");
    await expect(addDishToSlot(slot)).rejects.toThrow("REDIRECT /login");
    await expect(removeDishFromSlot(slot)).rejects.toThrow("REDIRECT /login");
    await expect(loadWeekMenu(slot.weekStart)).rejects.toThrow(
      "REDIRECT /login",
    );

    mockCookie(await signSession({ secret: SECRET }));
    const week = await loadWeekMenu(slot.weekStart);
    expect(week.items).toEqual([]);
  });

  it("rejects a slot that is not a Sunday, day, meal, and dish id", async () => {
    await expect(
      addDishToSlot({ ...slot, weekStart: "2026-01-05" }),
    ).resolves.toEqual({ ok: false, error: MENU_ACTION_ERROR.invalid });
    await expect(addDishToSlot({ ...slot, dayOfWeek: 9 })).resolves.toEqual({
      ok: false,
      error: MENU_ACTION_ERROR.invalid,
    });
    await expect(
      removeDishFromSlot({ ...slot, meal: "snack" }),
    ).resolves.toEqual({ ok: false, error: MENU_ACTION_ERROR.invalid });
    await expect(addDishToSlot(null)).resolves.toEqual({
      ok: false,
      error: MENU_ACTION_ERROR.invalid,
    });
  });

  it("rejects a dish that does not exist", async () => {
    await expect(
      addDishToSlot({ ...slot, dishId: "missing-dish" }),
    ).resolves.toEqual({ ok: false, error: MENU_ACTION_ERROR.missingDish });
    await expect(
      removeDishFromSlot({ ...slot, dishId: "missing-dish" }),
    ).resolves.toEqual({ ok: false, error: MENU_ACTION_ERROR.missingDish });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("adds a dish once and removes it once when toggled twice", async () => {
    const first = await addDishToSlot(slot);
    const second = await addDishToSlot(slot);

    expect(first).toMatchObject({ ok: true, added: true });
    expect(second).toMatchObject({ ok: true, added: false });
    if (!first.ok || !second.ok) return;

    expect(second.week.weekStart).toBe(slot.weekStart);
    expect(second.week.items).toHaveLength(1);
    expect(second.week.items[0]).toMatchObject({
      id: first.week.items[0]?.id,
      dayOfWeek: 2,
      meal: "dinner",
      dishId: dish.id,
      dishName: "番茄炒蛋",
    });

    const loaded = await loadWeekMenu(slot.weekStart);
    expect(loaded.items.map((item) => item.id)).toEqual([
      second.week.items[0]?.id,
    ]);

    const removed = await removeDishFromSlot(slot);
    const removedAgain = await removeDishFromSlot(slot);
    expect(removed).toMatchObject({ ok: true, added: false });
    expect(removedAgain).toMatchObject({ ok: true, added: false });
    if (!removed.ok || !removedAgain.ok) return;
    expect(removed.week.items).toEqual([]);
    expect(removedAgain.week.items).toEqual([]);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("falls back to the current Sunday when the week query is invalid", async () => {
    const week = await loadWeekMenu("not-a-date");
    expect(isSundayWeekStart(week.weekStart)).toBe(true);
    await expect(loadWeekMenu("2026-12-27")).resolves.toMatchObject({
      weekStart: "2026-12-27",
      items: [],
    });
  });

  it("fails closed when Vercel has no database and does not log a URL", async () => {
    process.env.VERCEL_ENV = "preview";
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(addDishToSlot(slot)).resolves.toEqual({
      ok: false,
      error: MENU_ACTION_ERROR.failed,
    });

    expect(error).toHaveBeenCalledWith("[db] DATABASE_URL is not set.");
    expect(error).toHaveBeenCalledWith(
      "[menu] Could not update the weekly menu.",
    );
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).not.toContain("postgres://");
    expect(logged).not.toContain("DATABASE_URL=");
  });
});

describe("custom item actions", () => {
  it("trims, deduplicates case-insensitively, renames/moves and removes custom items", async () => {
    const input = {
      weekStart: slot.weekStart,
      day: 1,
      meal: "dinner",
      name: "  Takeout  ",
    };
    const added = await addCustomItem(input);
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const item = added.week.items[0]!;
    expect(item).toMatchObject({ dishId: null, customName: "Takeout" });
    expect(await addCustomItem({ ...input, name: " takeOUT " })).toEqual({
      ok: false,
      error: "这顿已经有了",
    });
    const other = await addCustomItem({ ...input, day: 2 });
    expect(other.ok).toBe(true);
    expect(
      await renameCustomItem({
        id: item.id,
        name: "TAKEOUT",
        day: 2,
        meal: "dinner",
      }),
    ).toEqual({ ok: false, error: "这顿已经有了" });
    const moved = await renameCustomItem({
      id: item.id,
      name: " 聚餐 ",
      day: 3,
      meal: "lunch",
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.week.items.find((i) => i.id === item.id)).toMatchObject({
      customName: "聚餐",
      dayOfWeek: 3,
      meal: "lunch",
    });
    const removed = await removeDishFromSlot({
      weekStart: slot.weekStart,
      id: item.id,
      dayOfWeek: 3,
      meal: "lunch",
    });
    expect(removed.ok && removed.week.items.some((i) => i.id === item.id)).toBe(
      false,
    );
  });
  it.each(["", " ", "外".repeat(41)])(
    "rejects invalid custom names on the server",
    async (name) => {
      expect(
        (
          await addCustomItem({
            weekStart: slot.weekStart,
            day: 1,
            meal: "dinner",
            name,
          })
        ).ok,
      ).toBe(false);
    },
  );
});
