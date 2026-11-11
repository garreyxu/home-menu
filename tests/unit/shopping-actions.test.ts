import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  clear: vi.fn(),
  week: vi.fn(),
}));
vi.mock("@/lib/auth/require-session", () => ({
  requireSession: mocks.session,
}));
vi.mock("@/server/shopping-list", () => ({
  readShoppingList: mocks.read,
  writeShoppingCheck: mocks.write,
  clearStoredShoppingChecks: mocks.clear,
}));
vi.mock("@/server/menu", () => ({ getWeek: mocks.week }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
import {
  clearShoppingChecks,
  loadShoppingList,
  toggleShoppingCheck,
} from "@/app/shopping-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.week.mockResolvedValue({
    items: [{ dishName: "番茄炒蛋", ingredients: "鸡蛋，盐 (optional)" }],
  });
  mocks.session.mockResolvedValue({ subject: "test-family" });
  mocks.read.mockResolvedValue({
    list: { groups: [], pantry: [] },
    checked: [],
    menuEmpty: true,
    missing: [],
  });
});
describe("shopping server actions", () => {
  it("requires a signed-in session before reads and writes", async () => {
    mocks.session.mockRejectedValue(new Error("signed out"));
    await expect(loadShoppingList("2090-01-01")).rejects.toThrow("signed out");
    await expect(
      toggleShoppingCheck("2090-01-01", "鸡蛋", true),
    ).rejects.toThrow("signed out");
    await expect(clearShoppingChecks("2090-01-01")).rejects.toThrow(
      "signed out",
    );
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
  it("validates real Sunday weeks and strict check values", async () => {
    for (const week of ["2090-01-02", "2090-02-30", "bad", null]) {
      expect((await toggleShoppingCheck(week, "鸡蛋", true)).ok).toBe(false);
      expect((await clearShoppingChecks(week)).ok).toBe(false);
      expect((await loadShoppingList(week)).ok).toBe(false);
    }
    for (const name of [
      "",
      " 鸡蛋",
      "鸡蛋，盐",
      "鸡蛋\u0000",
      123,
      "蛋".repeat(201),
    ]) {
      expect((await toggleShoppingCheck("2090-01-01", name, true)).ok).toBe(
        false,
      );
    }
    expect((await toggleShoppingCheck("2090-01-01", "鸡蛋", "true")).ok).toBe(
      false,
    );
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects ingredients absent from the current week before any write", async () => {
    for (const checked of [true, false]) {
      expect(
        (await toggleShoppingCheck("2090-01-01", "牛肉", checked)).ok,
      ).toBe(false);
    }
    mocks.week.mockResolvedValueOnce(null);
    expect((await toggleShoppingCheck("2090-01-01", "鸡蛋", true)).ok).toBe(
      false,
    );
    mocks.week.mockResolvedValueOnce({ items: [] });
    expect((await toggleShoppingCheck("2090-01-01", "鸡蛋", true)).ok).toBe(
      false,
    );
    expect(mocks.week).toHaveBeenCalledWith("2090-01-01");
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("accepts pantry ingredients using their computed name", async () => {
    expect((await toggleShoppingCheck("2090-01-01", "盐", true)).ok).toBe(true);
    expect(mocks.write).toHaveBeenCalledWith(
      "2090-01-01",
      "盐",
      true,
      "test-family",
    );
  });
  it("uses the session subject for checked_by and reads fresh data after mutations", async () => {
    expect((await toggleShoppingCheck("2090-01-01", "鸡蛋", true)).ok).toBe(
      true,
    );
    expect(mocks.write).toHaveBeenCalledWith(
      "2090-01-01",
      "鸡蛋",
      true,
      "test-family",
    );
    expect((await toggleShoppingCheck("2090-01-01", "鸡蛋", false)).ok).toBe(
      true,
    );
    expect(mocks.write).toHaveBeenLastCalledWith(
      "2090-01-01",
      "鸡蛋",
      false,
      "test-family",
    );
    expect((await clearShoppingChecks("2090-01-01")).ok).toBe(true);
    expect(mocks.clear).toHaveBeenCalledWith("2090-01-01");
    expect(mocks.read).toHaveBeenCalledTimes(3);
  });
});
