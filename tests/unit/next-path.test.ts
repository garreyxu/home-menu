import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "@/lib/auth/next-path";

describe("sanitizeNextPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(sanitizeNextPath("/")).toBe("/");
    expect(sanitizeNextPath("/menu")).toBe("/menu");
    expect(sanitizeNextPath("/menu?week=1")).toBe("/menu?week=1");
    expect(sanitizeNextPath("/menu?week=1#sunday")).toBe("/menu?week=1#sunday");
    expect(decodeURIComponent(sanitizeNextPath("/菜单"))).toBe("/菜单");
    expect(sanitizeNextPath("  /week  ")).toBe("/week");
  });

  it("falls back to / for missing or unsafe values", () => {
    expect(sanitizeNextPath(null)).toBe("/");
    expect(sanitizeNextPath(undefined)).toBe("/");
    expect(sanitizeNextPath("")).toBe("/");
    expect(sanitizeNextPath("   ")).toBe("/");
    expect(sanitizeNextPath("https://evil.example/path")).toBe("/");
    expect(sanitizeNextPath("//evil.example")).toBe("/");
    expect(sanitizeNextPath("///evil.example")).toBe("/");
    expect(sanitizeNextPath("/\\evil.example")).toBe("/");
    expect(sanitizeNextPath("/\\evil.example/path")).toBe("/");
    expect(sanitizeNextPath("/%2f%2fevil.example")).toBe("/");
    expect(sanitizeNextPath("/%2F%2Fevil.example")).toBe("/");
    expect(sanitizeNextPath("/%5Cevil.example")).toBe("/");
    expect(sanitizeNextPath("javascript:alert(1)")).toBe("/");
    expect(sanitizeNextPath("/foo\nbar")).toBe("/");
    expect(sanitizeNextPath("/login")).toBe("/");
    expect(sanitizeNextPath("/login/extra")).toBe("/");
    expect(sanitizeNextPath(`/${"a".repeat(3000)}`)).toBe("/");
  });

  it("normalizes dot segments on this origin", () => {
    expect(sanitizeNextPath("/foo/../../etc")).toBe("/etc");
  });
});
