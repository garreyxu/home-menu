import { describe, expect, it } from "vitest";
import { formatSiteHeading } from "@/lib/site";

describe("formatSiteHeading", () => {
  it("joins the site name and tagline", () => {
    expect(formatSiteHeading()).toBe("家庭菜单 · 建设中");
  });
});
