import { describe, expect, it } from "vitest";

import { ILLUSTRATION_VERSION, illustrationForDish } from "@/lib/illustrations";

describe("illustrationForDish", () => {
  it("returns null when no size file is present", () => {
    expect(illustrationForDish("dish-1", () => false)).toBeNull();
  });

  it("rejects path traversal and emits 240/480/960 srcset urls", () => {
    expect(illustrationForDish("../secret", () => true)).toBeNull();
    expect(illustrationForDish("a/b", () => true)).toBeNull();

    const art = illustrationForDish(
      "dish 1",
      (file) => file.endsWith("-480.webp") || file.endsWith("-960.webp"),
    );
    expect(art).not.toBeNull();
    expect(art?.src).toBe(
      `/illustrations/dish%201-480.webp?v=${ILLUSTRATION_VERSION}`,
    );
    expect(art?.srcSet).toContain("480w");
    expect(art?.srcSet).toContain("960w");
    expect(art?.srcSet).not.toContain("240w");
    expect(art?.thumb).toContain("-480.webp");
  });
});
