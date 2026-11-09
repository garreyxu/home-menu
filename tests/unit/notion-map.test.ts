import { describe, expect, it } from "vitest";

import { classifyNotionPage } from "@/server/notion/map-page";
import type { NotionBlock, NotionPageSnapshot } from "@/server/notion/types";

const BODY_IMAGE =
  "https://cdn.example/dish.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc";
const COVER_IMAGE = "https://images.example/cover.jpg?sig=1";

function page(overrides: Partial<NotionPageSnapshot> = {}): NotionPageSnapshot {
  const blocks: NotionBlock[] = [
    {
      id: "h1",
      type: "heading_2",
      heading_2: { rich_text: [{ plain_text: "步骤" }] },
    },
    {
      id: "b1",
      type: "bulleted_list_item",
      bulleted_list_item: { rich_text: [{ plain_text: "切肉" }] },
    },
    {
      id: "t1",
      type: "to_do",
      to_do: { rich_text: [{ plain_text: "腌制" }], checked: true },
    },
    {
      id: "cols",
      type: "column_list",
      children: [
        {
          id: "col-a",
          type: "column",
          children: [
            {
              id: "p1",
              type: "paragraph",
              paragraph: { rich_text: [{ plain_text: "左" }] },
            },
          ],
        },
        {
          id: "col-b",
          type: "column",
          children: [
            {
              id: "img-1",
              type: "image",
              image: { type: "file", file: { url: BODY_IMAGE } },
            },
          ],
        },
      ],
    },
    {
      id: "tg",
      type: "toggle",
      toggle: { rich_text: [{ plain_text: "备注" }] },
      children: [
        {
          id: "p2",
          type: "paragraph",
          paragraph: { rich_text: [{ plain_text: "少盐" }] },
        },
      ],
    },
  ];

  return {
    id: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
    properties: {
      菜名: { type: "title", title: [{ plain_text: "  红烧肉<br />  " }] },
      "已尝试?": { type: "checkbox", checkbox: true },
      类型: { type: "select", select: { name: "大荤" } },
      料理时间: { type: "rich_text", rich_text: [{ plain_text: "30 分钟" }] },
      需要食材: { type: "rich_text", rich_text: [{ plain_text: "排骨" }] },
      评分: { type: "select", select: { name: "⭐⭐" } },
      菜系: {
        type: "multi_select",
        multi_select: [{ name: "川菜" }, { name: "家常" }],
      },
      主要食材种类: { type: "select", select: { name: "猪" } },
      作者: { type: "rich_text", rich_text: [{ plain_text: "不应该出现" }] },
      厨师: { type: "rich_text", rich_text: [{ plain_text: "也不该出现" }] },
    },
    cover: { type: "external", external: { url: COVER_IMAGE } },
    blocks,
    ...overrides,
  };
}

describe("classifyNotionPage", () => {
  it("does not use the page body as the card description", () => {
    const classified = classifyNotionPage(
      page({
        blocks: [
          {
            id: "intro",
            type: "paragraph",
            paragraph: {
              rich_text: [{ plain_text: "【简介】⏱ 制作时间 40 分钟" }],
            },
          },
          {
            id: "h1",
            type: "heading_2",
            heading_2: { rich_text: [{ plain_text: "步骤" }] },
          },
          {
            id: "b1",
            type: "bulleted_list_item",
            bulleted_list_item: { rich_text: [{ plain_text: "切肉" }] },
          },
        ],
      }),
    );
    expect(classified.kind).toBe("dish");
    if (classified.kind !== "dish") return;
    expect(classified.dish.description).toBeNull();
    expect(classified.dish.body.blocks[0]).toMatchObject({
      text: "【简介】⏱ 制作时间 40 分钟",
    });
  });

  it("maps a tried page and ignores fields that are not imported", () => {
    const classified = classifyNotionPage(page());
    expect(classified.kind).toBe("dish");
    if (classified.kind !== "dish") return;

    expect(classified.dish).toMatchObject({
      notionPageId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      name: "红烧肉",
      categoryName: "猪",
      cookTime: "30 分钟",
      ingredients: "排骨",
      rating: "⭐⭐",
      tried: true,
      cuisines: ["川菜", "家常"],
      mainIngredient: "猪",
      hasBody: true,
    });
    expect(classified.dish.description).toBeNull();
    expect(classified.dish).not.toHaveProperty("photo");
    expect(classified.dish.recipeBlocks).toEqual([
      { type: "heading", level: 2, spans: [{ text: "步骤" }] },
      {
        type: "bulleted_list_item",
        spans: [{ text: "切肉" }],
        children: [],
      },
      {
        type: "to_do",
        spans: [{ text: "腌制" }],
        checked: true,
        children: [],
      },
      { type: "paragraph", spans: [{ text: "左" }] },
      { type: "placeholder", label: "图片" },
      { type: "paragraph", spans: [{ text: "备注" }] },
      { type: "paragraph", spans: [{ text: "少盐" }] },
    ]);
    expect(JSON.stringify(classified.dish.recipeBlocks)).not.toContain(
      BODY_IMAGE,
    );
    expect(JSON.stringify(classified.dish.recipeBlocks)).not.toContain(
      "notion.so",
    );
    expect(classified.dish.body.blocks).toEqual([
      { type: "heading", level: 2, text: "步骤", children: [] },
      { type: "bulleted_list_item", text: "切肉", children: [] },
      { type: "to_do", text: "腌制", checked: true, children: [] },
      {
        type: "column_list",
        columns: [
          [{ type: "paragraph", text: "左", children: [] }],
          [{ type: "image" }],
        ],
      },
      {
        type: "toggle",
        text: "备注",
        children: [{ type: "paragraph", text: "少盐", children: [] }],
      },
    ]);
    expect(JSON.stringify(classified.dish)).not.toContain("不应该出现");
    expect(JSON.stringify(classified.dish)).not.toContain("也不该出现");
  });

  it("imports an unchecked page that has steps and stores tried false", () => {
    const classified = classifyNotionPage(
      page({
        properties: {
          菜名: { type: "title", title: [{ plain_text: "青菜" }] },
          "已尝试?": { type: "checkbox", checkbox: false },
        },
      }),
    );
    expect(classified.kind).toBe("dish");
    if (classified.kind === "dish") {
      expect(classified.dish.tried).toBe(false);
      expect(classified.dish.name).toBe("青菜");
    }
  });

  it("uses the 主要食材种类 option name and ignores 类型", () => {
    const duck = classifyNotionPage(
      page({
        properties: {
          菜名: { type: "title", title: [{ plain_text: "啤酒鸭" }] },
          "已尝试?": { type: "checkbox", checkbox: true },
          类型: { type: "select", select: { name: "大荤" } },
          主要食材种类: { type: "select", select: { name: "鸭" } },
        },
      }),
    );
    expect(duck.kind).toBe("dish");
    if (duck.kind === "dish") {
      expect(duck.dish.categoryName).toBe("鸭");
      expect(duck.dish.mainIngredient).toBe("鸭");
    }

    const passedThrough = classifyNotionPage(
      page({
        properties: {
          菜名: { type: "title", title: [{ plain_text: "排骨" }] },
          "已尝试?": { type: "checkbox", checkbox: true },
          类型: { type: "select", select: { name: "Pork" } },
          主要食材种类: { type: "select", select: { name: "Pork" } },
        },
      }),
    );
    expect(passedThrough.kind).toBe("dish");
    if (passedThrough.kind === "dish") {
      expect(passedThrough.dish.categoryName).toBe("Pork");
    }
  });

  it("uses 其他 when 主要食材种类 is empty and skips a blank name", () => {
    const uncategorized = classifyNotionPage(
      page({
        properties: {
          菜名: { type: "title", title: [{ plain_text: "盐酥鸡" }] },
          "已尝试?": { type: "checkbox", checkbox: true },
          类型: { type: "select", select: { name: "大荤" } },
          主要食材种类: { type: "select", select: null },
        },
        blocks: [
          {
            id: "p",
            type: "paragraph",
            paragraph: { rich_text: [{ plain_text: "步骤" }] },
          },
        ],
        cover: null,
      }),
    );
    expect(uncategorized.kind).toBe("dish");
    if (uncategorized.kind === "dish") {
      expect(uncategorized.dish.categoryName).toBe("其他");
      expect(uncategorized.dish.mainIngredient).toBeNull();
      expect(uncategorized.dish.tried).toBe(true);
    }

    const blank = classifyNotionPage(
      page({
        properties: {
          菜名: { type: "title", title: [{ plain_text: "  <br/>  " }] },
          "已尝试?": { type: "checkbox", checkbox: true },
        },
      }),
    );
    expect(blank).toEqual({ kind: "skip", name: null, reason: "菜名为空" });
  });

  it("does not import images only, an empty heading, or placeholder steps", () => {
    const images = classifyNotionPage(
      page({
        blocks: [
          {
            id: "img",
            type: "image",
            image: { type: "file", file: { url: BODY_IMAGE } },
          },
        ],
        cover: null,
      }),
    );
    expect(images).toEqual({ kind: "no_steps", name: "红烧肉" });

    const emptyHeading = classifyNotionPage(
      page({
        blocks: [
          {
            id: "h",
            type: "heading_2",
            heading_2: { rich_text: [{ plain_text: "" }] },
          },
        ],
        cover: null,
      }),
    );
    expect(emptyHeading).toEqual({ kind: "no_steps", name: "红烧肉" });

    const placeholder = classifyNotionPage(
      page({
        blocks: [
          {
            id: "h",
            type: "heading_2",
            heading_2: { rich_text: [{ plain_text: "步骤" }] },
          },
          {
            id: "p",
            type: "paragraph",
            paragraph: { rich_text: [{ plain_text: "待补充" }] },
          },
        ],
        cover: null,
      }),
    );
    expect(placeholder).toEqual({ kind: "no_steps", name: "红烧肉" });
  });

  it("does not treat ingredients as steps", () => {
    const classified = classifyNotionPage(
      page({
        properties: {
          菜名: { type: "title", title: [{ plain_text: "排骨汤" }] },
          "已尝试?": { type: "checkbox", checkbox: true },
          需要食材: { type: "rich_text", rich_text: [{ plain_text: "排骨" }] },
        },
        blocks: [],
        cover: null,
      }),
    );
    expect(classified).toEqual({ kind: "no_steps", name: "排骨汤" });
  });
});
