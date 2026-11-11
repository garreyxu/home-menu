import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RecipeBody } from "@/components/recipe-body";
import type { RecipeBlock } from "@/lib/recipe-blocks";

const blocks: RecipeBlock[] = [
  { type: "heading", level: 2, spans: [{ text: "步骤" }] },
  {
    type: "numbered_list_item",
    spans: [
      { text: "鸡蛋打散", bold: true },
      { text: "后下锅", italic: true },
    ],
    children: [
      {
        type: "bulleted_list_item",
        spans: [{ text: "<script>alert(1)</script>" }],
        children: [],
      },
    ],
  },
  { type: "to_do", spans: [{ text: "撒葱花" }], checked: true, children: [] },
  { type: "quote", spans: [{ text: "酸甜就好" }] },
  { type: "callout", spans: [{ text: "中火" }] },
  { type: "divider" },
  { type: "placeholder", label: "图片" },
];

describe("RecipeBody", () => {
  it("localizes body text in every block without mutating the recipe", () => {
    const blocks: RecipeBlock[] = [
      { type: "heading", level: 2, spans: [{ text: "10 min" }] },
      { type: "paragraph", spans: [{ text: "炖60 min", bold: true }] },
      {
        type: "bulleted_list_item",
        spans: [{ text: "酱豆腐1勺(option)" }],
        children: [
          {
            type: "numbered_list_item",
            spans: [{ text: "焖5 mins", italic: true }],
            children: [],
          },
        ],
      },
      {
        type: "to_do",
        spans: [{ text: "盐（OPTIONAL）" }],
        checked: false,
        children: [],
      },
      { type: "quote", spans: [{ text: "1hr" }] },
      { type: "callout", spans: [{ text: "2 hours" }] },
      { type: "placeholder", label: "嵌入内容" },
    ];
    const original = JSON.stringify(blocks);
    const html = renderToStaticMarkup(createElement(RecipeBody, { blocks }));
    for (const text of [
      "10 分钟",
      "<strong>炖60 分钟</strong>",
      "酱豆腐1勺（可选）",
      "<em>焖5 分钟</em>",
      "盐（可选）",
      "1 小时",
      "2 小时",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toMatch(/min|option|hours?/i);
    expect(JSON.stringify(blocks)).toBe(original);
  });

  it("renders rich text as elements and never as HTML or a Notion link", () => {
    const html = renderToStaticMarkup(createElement(RecipeBody, { blocks }));
    expect(html).toContain("<strong>鸡蛋打散</strong>");
    expect(html).toContain("<em>后下锅</em>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("notion.so");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("图片");
    expect(html).not.toContain("aria-checked");
    expect(html).toContain("<ol");
    expect(html).toContain("<ul");
  });

  it.each([
    ["Prep Time", "准备时间"],
    ["  cOoK tImE  ", "烹饪时间"],
    ["Shopping List", "需要食材"],
    ["INGREDIENTS", "需要食材"],
    ["Tips", "小贴士"],
    [" Steps ", "步骤"],
    ["instructions", "步骤"],
  ])("translates known heading %s", (text, expected) => {
    const html = renderToStaticMarkup(
      createElement(RecipeBody, {
        blocks: [{ type: "heading", level: 2, spans: [{ text }] }],
      }),
    );
    expect(html).toContain(`>${expected}</span>`);
    expect(html).not.toContain(`>${text}</span>`);
  });

  it("matches headings across rich-text spans and preserves unknown headings and paragraph text", () => {
    const html = renderToStaticMarkup(
      createElement(RecipeBody, {
        blocks: [
          {
            type: "heading",
            level: 1,
            spans: [{ text: " Shopping ", bold: true }, { text: "List " }],
          },
          {
            type: "heading",
            level: 3,
            spans: [{ text: " Chef's notes ", italic: true }],
          },
          { type: "paragraph", spans: [{ text: "Ingredients" }] },
        ],
      }),
    );
    expect(html).toContain("需要食材");
    expect(html).toContain("<em> Chef&#x27;s notes </em>");
    expect(html).toContain(">Ingredients</span>");
    expect(html).toContain("<h3");
    expect(html).toContain("<h5");
  });

  it("skips URL-less image blocks at every depth without breaking numbered lists", () => {
    const html = renderToStaticMarkup(
      createElement(RecipeBody, {
        blocks: [
          {
            type: "numbered_list_item",
            spans: [{ text: "第一步" }],
            children: [{ type: "placeholder", label: "图片" }],
          },
          { type: "placeholder", label: "图片" },
          {
            type: "numbered_list_item",
            spans: [{ text: "第二步" }],
            children: [],
          },
          { type: "placeholder", label: "嵌入内容" },
          { type: "placeholder", label: "未支持的内容" },
        ],
      }),
    );
    expect(html).not.toContain("图片");
    expect(html).not.toContain("<img");
    expect(html.match(/<ol /g)).toHaveLength(1);
    expect(html).toContain("嵌入内容");
    expect(html).toContain("未支持的内容");
  });

  it("renders checked and unchecked ingredients as plain bullet list items, including children", () => {
    const html = renderToStaticMarkup(
      createElement(RecipeBody, {
        blocks: [
          { type: "heading", level: 2, spans: [{ text: "Ingredients" }] },
          {
            type: "to_do",
            spans: [{ text: "鸡蛋", bold: true }],
            checked: true,
            children: [
              {
                type: "to_do",
                spans: [{ text: "两个" }],
                checked: false,
                children: [],
              },
            ],
          },
          {
            type: "bulleted_list_item",
            spans: [{ text: "番茄" }],
            children: [],
          },
          {
            type: "to_do",
            spans: [{ text: "盐" }],
            checked: false,
            children: [],
          },
        ],
      }),
    );
    expect(html.match(/<ul class="recipe-list">/g)).toHaveLength(2);
    expect(html.match(/<li>/g)).toHaveLength(4);
    expect(html).toContain("<strong>鸡蛋</strong>");
    expect(html).toContain("番茄");
    expect(html).toContain("两个");
    expect(html).toContain("盐");
    expect(html).not.toMatch(
      /checkbox|aria-checked|recipe-check|recipe-todo|<input|✓/,
    );
  });

  it("keeps URL-like recipe content as plain text", () => {
    const html = renderToStaticMarkup(
      createElement(RecipeBody, {
        blocks: [
          {
            type: "paragraph",
            spans: [{ text: "https://notion.so/example https://example.com" }],
          },
        ],
      }),
    );
    expect(html).toContain("https://notion.so/example");
    expect(html).not.toContain("<a");
  });

  it("says there is no recipe when the body is empty", () => {
    const html = renderToStaticMarkup(
      createElement(RecipeBody, { blocks: [] }),
    );
    expect(html).toContain("这道菜还没写做法");
    expect(html).not.toContain("notion.so");
    expect(html).not.toContain("<a ");
  });
});
