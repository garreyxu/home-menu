import { describe, expect, it } from "vitest";

import {
  STEP_PLACEHOLDERS,
  isPlaceholderStepText,
  pageHasSteps,
} from "@/server/notion/steps";
import type { NotionBlock, NotionPageSnapshot } from "@/server/notion/types";

function blocksOf(
  blocks: NotionBlock[],
  properties: NotionPageSnapshot["properties"] = {},
) {
  return { properties, blocks };
}

describe("STEP_PLACEHOLDERS", () => {
  it("keeps the placeholder list in one constant", () => {
    expect(STEP_PLACEHOLDERS).toEqual([
      "待补充",
      "待写",
      "TODO",
      "TBD",
      "暂无",
      "无",
      "-",
      "...",
    ]);
  });

  it("matches placeholders ignoring case, whitespace, and punctuation", () => {
    const samples = [
      "待补充",
      "  待写 ",
      "todo",
      "TODO!!!",
      "T.B.D.",
      "暂无",
      "无",
      "无。",
      "-",
      "—",
      "...",
      "……",
      "   ",
    ];
    for (const sample of samples) {
      expect(isPlaceholderStepText(sample)).toBe(true);
    }
    expect(isPlaceholderStepText("切肉")).toBe(false);
    expect(isPlaceholderStepText("无盐")).toBe(false);
    expect(isPlaceholderStepText("炒三分钟")).toBe(false);
  });
});

describe("pageHasSteps", () => {
  it("accepts a steps heading that contains a real list item", () => {
    expect(
      pageHasSteps(
        blocksOf([
          {
            id: "h",
            type: "heading_2",
            heading_2: { rich_text: [{ plain_text: "步骤" }] },
          },
          {
            id: "b",
            type: "bulleted_list_item",
            bulleted_list_item: { rich_text: [{ plain_text: "切肉" }] },
          },
        ]),
      ),
    ).toBe(true);
  });

  it("rejects images only", () => {
    expect(
      pageHasSteps(
        blocksOf([
          {
            id: "img",
            type: "image",
            image: { type: "file", file: { url: "https://cdn.example/a.jpg" } },
          },
          { id: "d", type: "divider" },
        ]),
      ),
    ).toBe(false);
  });

  it("rejects an empty heading and a steps heading with no items", () => {
    expect(
      pageHasSteps(
        blocksOf([
          {
            id: "h",
            type: "heading_2",
            heading_2: { rich_text: [] },
          },
        ]),
      ),
    ).toBe(false);
    expect(
      pageHasSteps(
        blocksOf([
          {
            id: "h",
            type: "heading_2",
            heading_2: { rich_text: [{ plain_text: "做法：" }] },
          },
        ]),
      ),
    ).toBe(false);
  });

  it("rejects a steps section whose only text is a placeholder", () => {
    expect(
      pageHasSteps(
        blocksOf([
          {
            id: "intro",
            type: "paragraph",
            paragraph: { rich_text: [{ plain_text: "这是简介，不算步骤" }] },
          },
          {
            id: "h",
            type: "heading_2",
            heading_2: { rich_text: [{ plain_text: "步骤" }] },
          },
          {
            id: "p",
            type: "numbered_list_item",
            numbered_list_item: { rich_text: [{ plain_text: " TBD " }] },
          },
        ]),
      ),
    ).toBe(false);
  });

  it("rejects ingredients when there are no steps", () => {
    expect(
      pageHasSteps({
        properties: {
          需要食材: { type: "rich_text", rich_text: [{ plain_text: "排骨" }] },
        },
        blocks: [],
      }),
    ).toBe(false);
  });

  it("accepts a 做法 property with real text and rejects a placeholder property", () => {
    expect(
      pageHasSteps({
        properties: {
          做法: {
            type: "rich_text",
            rich_text: [{ plain_text: "热油\n下锅" }],
          },
        },
        blocks: [],
      }),
    ).toBe(true);
    expect(
      pageHasSteps({
        properties: {
          做法: { type: "rich_text", rich_text: [{ plain_text: "待补充" }] },
        },
        blocks: [
          {
            id: "p",
            type: "paragraph",
            paragraph: { rich_text: [{ plain_text: "炒三分钟" }] },
          },
        ],
      }),
    ).toBe(false);
  });

  it("accepts a paragraph when the page has no steps section", () => {
    expect(
      pageHasSteps(
        blocksOf([
          {
            id: "p",
            type: "paragraph",
            paragraph: { rich_text: [{ plain_text: "炒三分钟" }] },
          },
        ]),
      ),
    ).toBe(true);
  });
});
