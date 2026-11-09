import { describe, expect, it } from "vitest";
import { formatSiteHeading } from "@/lib/site";

describe("formatSiteHeading", () => {
  it("joins the site name and tagline", () => {
    expect(formatSiteHeading()).toBe("御膳房 · 建设中");
  });
});
