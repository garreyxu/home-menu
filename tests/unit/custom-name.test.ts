import { describe, expect, it } from "vitest";
import { validateCustomName } from "@/lib/custom-name";

describe("custom names", () => {
  it("trims surrounding whitespace", () =>
    expect(validateCustomName(" \t寿司外卖\n ")).toBe("寿司外卖"));
  it("accepts 1 through 40 characters after trimming", () => {
    expect(validateCustomName("外")).toBe("外");
    expect(validateCustomName(` ${"外".repeat(40)} `)).toHaveLength(40);
  });
  it.each(["", " \t\n", "外".repeat(41), null, 42])(
    "rejects empty, oversized or nontext names: %s",
    (value) => {
      expect(() => validateCustomName(value)).toThrow();
    },
  );
});
