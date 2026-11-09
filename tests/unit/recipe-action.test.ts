import { cookies } from "next/headers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadDishRecipe } from "@/app/recipe-actions";
import { signSession } from "@/lib/auth/session";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("REDIRECT ")) {
      throw error;
    }
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

const SECRET = "unit-test-session-secret-not-for-production";
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalVercelEnv = process.env.VERCEL_ENV;
const originalSecret = process.env.SESSION_SECRET;

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
  mockCookie(await signSession({ secret: SECRET }));
});

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

describe("loadDishRecipe", () => {
  it("requires a session before reading a recipe", async () => {
    mockCookie(undefined);
    await expect(loadDishRecipe("sample-dish:番茄炒蛋")).rejects.toThrow(
      "REDIRECT /login",
    );
  });

  it("returns the seeded body and an empty body without a Notion link", async () => {
    const recipe = await loadDishRecipe("sample-dish:番茄炒蛋");
    expect(recipe.ok).toBe(true);
    if (!recipe.ok) return;
    expect(recipe.name).toBe("番茄炒蛋");
    expect(JSON.stringify(recipe.blocks)).toContain("鸡蛋打散");
    expect(JSON.stringify(recipe.blocks)).not.toContain("notion.so");

    const plain = await loadDishRecipe("sample-dish:米饭");
    expect(plain).toEqual({ ok: true, name: "米饭", blocks: [] });
  });

  it("does not invent a recipe for an unknown dish", async () => {
    await expect(loadDishRecipe("sample-dish:没有这道菜")).resolves.toEqual({
      ok: false,
      error: "找不到这道菜。",
    });
    await expect(loadDishRecipe("")).resolves.toEqual({
      ok: false,
      error: "这道菜的编号不对。",
    });
    await expect(loadDishRecipe(12)).resolves.toEqual({
      ok: false,
      error: "这道菜的编号不对。",
    });
  });
});
