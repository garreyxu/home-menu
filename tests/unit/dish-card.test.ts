import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { brushRuns } from "@/components/brush-runs";
import { DishCard } from "@/components/dish-card";
import { fallbackLines } from "@/components/dish-fallback";

describe("brushRuns", () => {
  it("puts ASCII letters and Roman numerals in the sans run", () => {
    expect(brushRuns("葱爆羊肉 I")).toEqual([
      { text: "葱爆羊肉", latin: false },
      { text: " I", latin: true },
    ]);
    expect(brushRuns("红烧肉Ⅱ")).toEqual([
      { text: "红烧肉", latin: false },
      { text: "Ⅱ", latin: true },
    ]);
  });
});

describe("DishCard", () => {
  it("paints a brush fallback and an ink 做过 tag, with no card stamp", () => {
    const tried = renderToStaticMarkup(
      createElement(DishCard, {
        id: "dish-pork",
        name: "红烧肉",
        categoryName: "大荤",
        description: "【简介】⏱ 制作时间 40 分钟",
        tried: true,
      }),
    );
    expect(tried).toContain("tried-tag");
    expect(tried).toContain("做过");
    expect(tried).not.toContain("seal-on-art");
    expect(tried).not.toContain("印");
    expect(tried).not.toContain("简介");
    expect(tried).not.toContain("制作时间");
    expect(tried).not.toContain("dish-note");
    expect(tried).toContain("还没有插画");
    expect(tried).not.toContain("<img");
    expect(tried).toContain("aspect-[4/3]");

    const fresh = renderToStaticMarkup(
      createElement(DishCard, {
        id: "dish-greens",
        name: "青菜",
        categoryName: "素菜",
        tried: false,
      }),
    );
    expect(fresh).not.toContain("做过");
    expect(fresh).not.toContain("推荐");
    expect(fresh).toContain("还没有插画");
  });

  it("uses the 240/480/960 srcset when an illustration is present", () => {
    const html = renderToStaticMarkup(
      createElement(DishCard, {
        id: "dish-1",
        name: "番茄炒蛋",
        categoryName: "家常菜",
        illustration: {
          src: "/illustrations/dish-1-480.webp?v=1",
          srcSet:
            "/illustrations/dish-1-240.webp?v=1 240w, /illustrations/dish-1-480.webp?v=1 480w, /illustrations/dish-1-960.webp?v=1 960w",
          sizes: "50vw",
          thumb: "/illustrations/dish-1-240.webp?v=1",
        },
      }),
    );
    expect(html).toContain('src="/illustrations/dish-1-480.webp?v=1"');
    expect(html).toContain("240w");
    expect(html).toContain("480w");
    expect(html).toContain("960w");
    expect(html).toContain("object-contain");
    expect(html).not.toContain("还没有插画");
  });
});

describe("fallbackLines", () => {
  it("keeps four characters on one line and splits longer names", () => {
    expect(fallbackLines("红烧肉")).toEqual(["红烧肉"]);
    expect(fallbackLines("番茄炒蛋")).toEqual(["番茄炒蛋"]);
    expect(fallbackLines("清炒西兰花")).toEqual(["清炒西", "兰花"]);
  });
});
