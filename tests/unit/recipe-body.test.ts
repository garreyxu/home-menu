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
  it("renders rich text as elements and never as HTML or a Notion link", () => {
    const html = renderToStaticMarkup(createElement(RecipeBody, { blocks }));
    expect(html).toContain("<strong>鸡蛋打散</strong>");
    expect(html).toContain("<em>后下锅</em>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("notion.so");
    expect(html).not.toContain("<a ");
    expect(html).toContain("图片");
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("<ol");
    expect(html).toContain("<ul");
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
