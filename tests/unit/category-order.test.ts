import { describe, expect, it } from "vitest";

import {
  CATEGORY_DISPLAY_ORDER,
  orderCategoryNames,
  planCategoryAlignment,
} from "@/server/notion/category-order";

const KNOWN = [...CATEGORY_DISPLAY_ORDER];

describe("orderCategoryNames", () => {
  it("keeps known options in the display order and drops ones with no dishes", () => {
    expect(
      orderCategoryNames(["酱汁", "鸡", "其他", "猪", "汤", "猪"]),
    ).toEqual(["猪", "鸡", "汤", "酱汁", "其他"]);
    expect(orderCategoryNames(["汤"])).toEqual(["汤"]);
    expect(orderCategoryNames(KNOWN)).toEqual(KNOWN);
  });

  it("places unknown options before 其他 in Notion's option order", () => {
    const notion = ["猪", "其他", "鸭", "鹅", "牛"];
    expect(
      orderCategoryNames(["鹅", "其他", "鸭", "猪", "酱汁"], notion),
    ).toEqual(["猪", "酱汁", "鸭", "鹅", "其他"]);
  });

  it("keeps an unknown that left the schema before 其他, after schema unknowns", () => {
    expect(
      orderCategoryNames(["其他", "怪味", "鸭"], ["鸭", "猪", "其他"]),
    ).toEqual(["鸭", "怪味", "其他"]);
  });

  it("does not invent 其他 or known options that were not given", () => {
    expect(orderCategoryNames(["鹅", "鸭"], ["鹅", "鸭"])).toEqual([
      "鹅",
      "鸭",
    ]);
    expect(orderCategoryNames([])).toEqual([]);
    expect(orderCategoryNames(["", "  ", "其他", "其他"])).toEqual(["其他"]);
  });
});

describe("planCategoryAlignment", () => {
  it("deletes stale 类型 rows and a renamed option, then orders what remains", () => {
    const plan = planCategoryAlignment({
      categories: [
        { id: "old-meat", name: "大荤" },
        { id: "old-soup", name: "靓汤" },
        { id: "pork", name: "猪" },
        { id: "duck", name: "鸭" },
        { id: "other", name: "其他" },
        { id: "renamed-away", name: "猪肉" },
      ],
      referencedCategoryIds: new Set(["pork", "duck", "other"]),
      notionOptionOrder: ["猪", "鸭", "牛", "其他"],
    });

    expect(plan.deleteIds).toEqual(["old-meat", "old-soup", "renamed-away"]);
    expect(plan.sort).toEqual([
      { id: "pork", sortOrder: 0 },
      { id: "duck", sortOrder: 1 },
      { id: "other", sortOrder: 2 },
    ]);
  });

  it("keeps a category an inactive dish still references", () => {
    const plan = planCategoryAlignment({
      categories: [
        { id: "old-meat", name: "大荤" },
        { id: "pork", name: "猪" },
      ],
      referencedCategoryIds: new Set(["old-meat", "pork"]),
      notionOptionOrder: ["猪", "牛", "其他"],
    });

    expect(plan.deleteIds).toEqual([]);
    expect(plan.sort).toEqual([
      { id: "pork", sortOrder: 0 },
      { id: "old-meat", sortOrder: 1 },
    ]);
  });

  it("deletes every category when nothing references one", () => {
    expect(
      planCategoryAlignment({
        categories: [{ id: "old", name: "未分类" }],
        referencedCategoryIds: new Set(),
        notionOptionOrder: [],
      }),
    ).toEqual({ sort: [], deleteIds: ["old"] });
  });
});
