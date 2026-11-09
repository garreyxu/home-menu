import { describe, expect, it } from "vitest";

import { parseRecipeBlocks } from "@/lib/recipe-blocks";
import { readBlockChildrenPage } from "@/server/notion/block-page";
import { normalizeRecipeBlocks } from "@/server/notion/recipe-blocks";
import type { NotionBlock } from "@/server/notion/types";

describe("readBlockChildrenPage", () => {
  it("reads two pages in order and rejects a cursor that never arrives", () => {
    const first = readBlockChildrenPage({
      results: [
        {
          id: "a",
          type: "paragraph",
          paragraph: { rich_text: [{ plain_text: "先" }] },
        },
      ],
      has_more: true,
      next_cursor: "page-2",
    });
    const second = readBlockChildrenPage({
      results: [
        {
          id: "b",
          type: "paragraph",
          paragraph: { rich_text: [{ plain_text: "后" }] },
        },
      ],
      has_more: false,
      next_cursor: null,
    });

    expect(first.nextCursor).toBe("page-2");
    expect(second.nextCursor).toBeNull();
    expect(normalizeRecipeBlocks([...first.blocks, ...second.blocks])).toEqual([
      { type: "paragraph", spans: [{ text: "先" }] },
      { type: "paragraph", spans: [{ text: "后" }] },
    ]);
    expect(() =>
      readBlockChildrenPage({
        results: [],
        has_more: true,
        next_cursor: "",
      }),
    ).toThrow("正文读取失败");
    expect(() => readBlockChildrenPage({ has_more: false })).toThrow(
      "正文读取失败",
    );
  });
});

describe("normalizeRecipeBlocks", () => {
  it("keeps one level of nested list children and rich text, and drops links", () => {
    const blocks: NotionBlock[] = [
      {
        id: "1",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [
            {
              plain_text: "外",
              annotations: { bold: true, italic: false },
              href: "https://www.notion.so/outer",
            },
            { plain_text: "层", annotations: { italic: true } },
          ],
        },
        children: [
          {
            id: "2",
            type: "numbered_list_item",
            numbered_list_item: {
              rich_text: [{ plain_text: "内" }],
            },
            children: [
              {
                id: "3",
                type: "paragraph",
                paragraph: { rich_text: [{ plain_text: "孙" }] },
              },
            ],
          },
        ],
      },
    ];

    const normalized = normalizeRecipeBlocks(blocks);
    expect(normalized).toEqual([
      {
        type: "bulleted_list_item",
        spans: [
          { text: "外", bold: true },
          { text: "层", italic: true },
        ],
        children: [
          {
            type: "numbered_list_item",
            spans: [{ text: "内" }],
            children: [],
          },
        ],
      },
    ]);
    const stored = JSON.stringify(normalized);
    expect(stored).not.toContain("孙");
    expect(stored).not.toContain("notion.so");
    expect(stored).not.toContain("href");
  });

  it("turns images, embeds, and unknown blocks into placeholders", () => {
    const blocks: NotionBlock[] = [
      {
        id: "img",
        type: "image",
        image: {
          type: "external",
          external: { url: "https://www.notion.so/pic" },
        },
      },
      {
        id: "book",
        type: "bookmark",
        bookmark: { url: "https://www.notion.so/page" },
      } as NotionBlock,
      {
        id: "eq",
        type: "equation",
        equation: { expression: "x" },
      } as NotionBlock,
      {
        id: "wrap",
        type: "synced_block",
        children: [
          {
            id: "kept",
            type: "quote",
            quote: { rich_text: [{ plain_text: "留着" }] },
          },
        ],
      },
      { id: "rule", type: "divider" },
      {
        id: "note",
        type: "callout",
        callout: { rich_text: [{ plain_text: "中火" }] },
      },
      {
        id: "done",
        type: "to_do",
        to_do: { rich_text: [{ plain_text: "出锅" }], checked: false },
      },
    ];

    expect(normalizeRecipeBlocks(blocks)).toEqual([
      { type: "placeholder", label: "图片" },
      { type: "placeholder", label: "嵌入内容" },
      { type: "placeholder", label: "未支持的内容" },
      { type: "quote", spans: [{ text: "留着" }] },
      { type: "divider" },
      { type: "callout", spans: [{ text: "中火" }] },
      {
        type: "to_do",
        spans: [{ text: "出锅" }],
        checked: false,
        children: [],
      },
    ]);
    expect(JSON.stringify(normalizeRecipeBlocks(blocks))).not.toContain(
      "notion.so",
    );
  });
});

describe("parseRecipeBlocks", () => {
  it("drops links, unknown types, and list nesting past one level", () => {
    const parsed = parseRecipeBlocks([
      {
        type: "paragraph",
        spans: [{ text: "炒", bold: true, href: "https://www.notion.so/x" }],
        url: "https://www.notion.so/x",
      },
      { type: "embed", url: "https://www.notion.so/y" },
      {
        type: "bulleted_list_item",
        spans: [{ text: "外" }],
        children: [
          {
            type: "bulleted_list_item",
            spans: [{ text: "内" }],
            children: [{ type: "paragraph", spans: [{ text: "孙" }] }],
          },
        ],
      },
      { type: "placeholder", label: "随便写的" },
      { type: "placeholder", label: "图片" },
    ]);

    expect(parsed).toEqual([
      { type: "paragraph", spans: [{ text: "炒", bold: true }] },
      {
        type: "bulleted_list_item",
        spans: [{ text: "外" }],
        children: [
          {
            type: "bulleted_list_item",
            spans: [{ text: "内" }],
            children: [],
          },
        ],
      },
      { type: "placeholder", label: "图片" },
    ]);
    expect(JSON.stringify(parsed)).not.toContain("孙");
    expect(JSON.stringify(parsed)).not.toContain("notion.so");
  });
});
