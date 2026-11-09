import { describe, expect, it } from "vitest";

import {
  SYNC_BUDGET_MS,
  orderForRecipeBackfill,
  syncRecipeBodies,
} from "@/server/notion/body-sync";
import type { NotionBlock } from "@/server/notion/types";

const OLD = "2020-01-01T00:00:00.000Z";

function step(text: string): NotionBlock[] {
  return [
    {
      id: text,
      type: "paragraph",
      paragraph: { rich_text: [{ plain_text: text }] },
    },
  ];
}

describe("orderForRecipeBackfill", () => {
  it("reads missing recipe_blocks first and ignores last_edited_time", () => {
    const ordered = orderForRecipeBackfill(
      [
        { id: "has-body", lastEditedTime: "2019-01-01T00:00:00.000Z" },
        { id: "missing-new", lastEditedTime: OLD },
        { id: "missing-old", lastEditedTime: OLD },
      ],
      [
        { notionPageId: "has-body", hasRecipe: true, lastEditedTime: OLD },
        { notionPageId: "missing-old", hasRecipe: false, lastEditedTime: OLD },
      ],
    );
    expect(ordered.map((page) => page.id)).toEqual([
      "missing-new",
      "missing-old",
      "has-body",
    ]);
  });
});

describe("syncRecipeBodies", () => {
  it("finishes 43 pages at 2.8s each inside the 240s budget", async () => {
    expect(SYNC_BUDGET_MS).toBe(240_000);
    const pages = Array.from({ length: 43 }, (_, index) => ({
      id: `page-${index}`,
    }));
    let clock = 0;
    const saved: string[] = [];
    const result = await syncRecipeBodies({
      pages,
      stored: [],
      budgetMs: SYNC_BUDGET_MS,
      now: () => clock,
      concurrency: 1,
      loadBlocks: async (id) => {
        clock += 2_800;
        return step(id);
      },
      saveBatch: async (items) => {
        for (const item of items) saved.push(item.page.id);
      },
      fail: async () => {
        throw new Error("unexpected failure");
      },
      defer: async () => {},
    });
    expect(result.partial).toBe(false);
    expect(result.deferred).toEqual([]);
    expect(saved).toHaveLength(43);
  });

  it("still resumes on the next run when a short budget stops early", async () => {
    const pages = [
      { id: "filled", lastEditedTime: OLD },
      { id: "null-a", lastEditedTime: OLD },
      { id: "null-b", lastEditedTime: OLD },
    ];
    const saved = new Map<string, NotionBlock[]>();
    let clock = 0;

    const first = await syncRecipeBodies({
      pages,
      stored: [
        { notionPageId: "filled", hasRecipe: true, lastEditedTime: OLD },
        { notionPageId: "null-a", hasRecipe: false, lastEditedTime: OLD },
        { notionPageId: "null-b", hasRecipe: false, lastEditedTime: OLD },
      ],
      budgetMs: 45_000,
      now: () => clock,
      concurrency: 1,
      loadBlocks: async (id) => {
        clock += 20_000;
        if (clock > 45_000) return "timeout";
        return step(id);
      },
      saveBatch: async (items) => {
        for (const item of items) saved.set(item.page.id, item.blocks);
      },
      fail: async () => {
        throw new Error("unexpected failure");
      },
      defer: async () => {},
    });

    expect(first.partial).toBe(true);
    expect(first.saved).toEqual(["null-a", "null-b"]);
    expect(first.deferred).toEqual(["filled"]);
    expect(saved.has("filled")).toBe(false);
    expect(saved.get("null-a")?.[0]).toMatchObject({ id: "null-a" });

    clock = 0;
    const second = await syncRecipeBodies({
      pages,
      stored: [
        { notionPageId: "filled", hasRecipe: false, lastEditedTime: OLD },
        { notionPageId: "null-a", hasRecipe: true, lastEditedTime: OLD },
        { notionPageId: "null-b", hasRecipe: true, lastEditedTime: OLD },
      ],
      budgetMs: 45_000,
      now: () => clock,
      concurrency: 1,
      loadBlocks: async (id) => {
        clock += 20_000;
        if (clock > 45_000) return "timeout";
        return step(id);
      },
      saveBatch: async (items) => {
        for (const item of items) saved.set(item.page.id, item.blocks);
      },
      fail: async () => {
        throw new Error("unexpected failure");
      },
      defer: async () => {},
    });

    expect(second.saved[0]).toBe("filled");
    expect(saved.get("filled")?.[0]).toMatchObject({ id: "filled" });
  });

  it("fetches at most 3 bodies at once and writes them in batches", async () => {
    const ids = ["a", "b", "c", "d", "e"];
    let active = 0;
    let maxActive = 0;
    const batches: string[][] = [];

    await syncRecipeBodies({
      pages: ids.map((id) => ({ id })),
      stored: [],
      budgetMs: 60_000,
      now: () => 0,
      concurrency: 3,
      batchSize: 2,
      loadBlocks: async (id) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 15));
        active -= 1;
        return step(id);
      },
      saveBatch: async (items) => {
        batches.push(items.map((item) => item.page.id));
      },
      fail: async () => {
        throw new Error("unexpected failure");
      },
      defer: async () => {},
    });

    expect(maxActive).toBe(3);
    expect(batches.flat().sort()).toEqual([...ids].sort());
    expect(batches.every((batch) => batch.length <= 2)).toBe(true);
    expect(batches.some((batch) => batch.length === 2)).toBe(true);
  });
});
