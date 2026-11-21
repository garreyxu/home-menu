import { describe, expect, it } from "vitest";

import { drinkBaseOptions, filterDrinksByBase } from "@/lib/drinks";
import { mapDrinkPage } from "@/server/notion/map-drink";
import type { NotionBlock, NotionPageSnapshot } from "@/server/notion/types";

const SIGNED =
  "https://prod-files-secure.s3.us-west-2.amazonaws.com/cocktail.jpg?X-Amz-Signature=abc";

function page(
  properties: NotionPageSnapshot["properties"],
  blocks: NotionBlock[] | null = [],
) {
  return mapDrinkPage({
    id: "419758B3-080F-8168-BD89-CBB70785AF72",
    properties,
    blocks,
  });
}

describe("mapDrinkPage", () => {
  it("maps a full cocktail and keeps the photo URL out of the stored drink", () => {
    const mapped = page(
      {
        酒名: { type: "title", title: [{ plain_text: "  金汤力<br />  " }] },
        基酒: {
          type: "multi_select",
          multi_select: [{ name: "金酒" }, { name: "金酒" }, { name: "  " }],
        },
        口味: { type: "multi_select", multi_select: [{ name: "清爽" }] },
        配料: {
          type: "rich_text",
          rich_text: [{ plain_text: "金酒 45ml、汤力水" }],
        },
        照片: {
          type: "files",
          files: [{ type: "file", file: { url: SIGNED } }],
        },
        出处: { type: "url", url: "https://example.com/gin" },
        "已尝试?": { type: "checkbox", checkbox: true },
      },
      [
        {
          id: "step",
          type: "numbered_list_item",
          numbered_list_item: { rich_text: [{ plain_text: "倒入金酒" }] },
        },
        {
          id: "img",
          type: "image",
          image: { type: "file", file: { url: SIGNED } },
        },
      ],
    );

    expect(mapped.kind).toBe("drink");
    if (mapped.kind !== "drink") return;
    expect(mapped.drink).toMatchObject({
      notionPageId: "419758b3-080f-8168-bd89-cbb70785af72",
      name: "金汤力",
      baseSpirits: ["金酒"],
      flavors: ["清爽"],
      ingredients: "金酒 45ml、汤力水",
      sourceUrl: "https://example.com/gin",
      tried: true,
      hasBody: true,
    });
    expect(mapped.drink.recipeBlocks).toEqual([
      {
        type: "numbered_list_item",
        spans: [{ text: "倒入金酒" }],
        children: [],
      },
      { type: "placeholder", label: "图片" },
    ]);
    expect(mapped.photoUrl).toBe(SIGNED);
    expect(mapped.preserveBody).toBe(false);
    expect(JSON.stringify(mapped.drink)).not.toContain("X-Amz-Signature");
    expect(JSON.stringify(mapped.drink)).not.toContain("amazonaws");
  });

  it("keeps a named drink when fields are missing and does not treat that as an error", () => {
    const mapped = page({
      酒名: { type: "title", title: [{ plain_text: "素酒" }] },
    });
    expect(mapped).toMatchObject({
      kind: "drink",
      photoUrl: null,
      preserveBody: false,
      drink: {
        name: "素酒",
        baseSpirits: [],
        flavors: [],
        ingredients: null,
        sourceUrl: null,
        tried: false,
        recipeBlocks: [],
        hasBody: false,
      },
    });
  });

  it("skips a blank title and ignores unsafe or empty photo and source fields", () => {
    expect(
      page({ 酒名: { type: "title", title: [{ plain_text: "   " }] } }),
    ).toEqual({ kind: "skip", name: null, reason: "酒名为空" });

    const mapped = page({
      酒名: { type: "title", title: [{ plain_text: "无图" }] },
      照片: { type: "files", files: [] },
      出处: { type: "url", url: "javascript:alert(1)" },
      配料: { type: "rich_text", rich_text: [] },
      基酒: { type: "multi_select", multi_select: null },
      "已尝试?": { type: "rich_text", rich_text: [{ plain_text: "是" }] },
    });
    expect(mapped.kind).toBe("drink");
    if (mapped.kind !== "drink") return;
    expect(mapped.photoUrl).toBeNull();
    expect(mapped.drink.sourceUrl).toBeNull();
    expect(mapped.drink.ingredients).toBeNull();
    expect(mapped.drink.baseSpirits).toEqual([]);
    expect(mapped.drink.tried).toBe(false);
  });

  it("preserves the previous steps when the body was not read", () => {
    const mapped = page(
      {
        酒名: { type: "title", title: [{ plain_text: "旧酒" }] },
        照片: {
          type: "files",
          files: [
            { type: "external", external: { url: "http://insecure/a.jpg" } },
          ],
        },
      },
      null,
    );
    expect(mapped.kind).toBe("drink");
    if (mapped.kind !== "drink") return;
    expect(mapped.preserveBody).toBe(true);
    expect(mapped.photoUrl).toBeNull();
    expect(mapped.drink.recipeBlocks).toEqual([]);
  });
});

describe("drink base filter", () => {
  const drinks = [
    { name: "金汤力", baseSpirits: ["金酒"] },
    { name: "威士忌酸", baseSpirits: ["威士忌"] },
  ];

  it("lists bases and filters without dropping an unknown request into 全部", () => {
    expect(drinkBaseOptions(drinks)).toEqual(["金酒", "威士忌"]);
    expect(
      filterDrinksByBase(drinks, "金酒").map((drink) => drink.name),
    ).toEqual(["金汤力"]);
    expect(filterDrinksByBase(drinks, null)).toHaveLength(2);
  });
});
