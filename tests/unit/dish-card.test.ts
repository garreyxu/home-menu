import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DishCard } from "@/components/dish-card";

describe("DishCard", () => {
  it("shows a plain 做过 label only when tried, and the plate when there is no image", () => {
    const tried = renderToStaticMarkup(
      createElement(DishCard, {
        name: "红烧肉",
        categoryName: "大荤",
        tried: true,
      }),
    );
    expect(tried).toContain("做过");
    expect(tried).toContain("text-kelp");
    expect(tried).toContain("还没有照片");
    expect(tried).not.toContain("<img");

    const fresh = renderToStaticMarkup(
      createElement(DishCard, {
        name: "青菜",
        categoryName: "素菜",
        tried: false,
      }),
    );
    expect(fresh).not.toContain("做过");
    expect(fresh).toContain("还没有照片");
  });
});
