import { describe, expect, it } from "vitest";

import {
  importNotionCatalog,
  type DishRepository,
  type StoredNotionDish,
  type UpsertDish,
} from "@/server/notion/import-catalog";
import { formatImportReport, safeSyncError } from "@/server/notion/report";
import type { NotionBlock, NotionPageSnapshot } from "@/server/notion/types";

const TRIED = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PLAIN = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function stepBlocks(text = "炖"): NotionBlock[] {
  return [
    {
      id: "step",
      type: "paragraph",
      paragraph: { rich_text: [{ plain_text: text }] },
    },
  ];
}

function snapshot(
  id: string,
  name: string,
  tried: boolean,
  blocks: NotionPageSnapshot["blocks"] = stepBlocks(),
): NotionPageSnapshot {
  return {
    id,
    properties: {
      菜名: { type: "title", title: [{ plain_text: name }] },
      "已尝试?": { type: "checkbox", checkbox: tried },
      类型: { type: "select", select: { name: "大荤" } },
    },
    cover: null,
    blocks,
  };
}

class MemoryDishes implements DishRepository {
  rows = new Map<
    string,
    StoredNotionDish & {
      tried: boolean;
      hasBody: boolean;
      categoryName: string;
    }
  >();
  /** Notion page ids that a weekly menu still references. */
  referenced = new Set<string>();

  async listNotionDishes(): Promise<StoredNotionDish[]> {
    return [...this.rows.values()].map((row) => ({
      id: row.id,
      notionPageId: row.notionPageId,
      name: row.name,
      isActive: row.isActive,
    }));
  }

  async upsert(dish: UpsertDish) {
    const existing = this.rows.get(dish.notionPageId);
    if (!existing) {
      this.rows.set(dish.notionPageId, {
        ...dish,
        id: `dish-${this.rows.size + 1}`,
        isActive: true,
      });
      return "added" as const;
    }
    this.rows.set(dish.notionPageId, {
      ...existing,
      ...dish,
      id: existing.id,
      isActive: true,
    });
    return "updated" as const;
  }

  async retire(notionPageIds: readonly string[]) {
    let deleted = 0;
    let inactivated = 0;
    for (const id of notionPageIds) {
      const row = this.rows.get(id);
      if (!row) continue;
      if (this.referenced.has(id)) {
        if (row.isActive) {
          row.isActive = false;
          inactivated += 1;
        }
      } else {
        this.rows.delete(id);
        deleted += 1;
      }
    }
    return { deleted, inactivated };
  }

  async countOnWall() {
    return {
      onWall: [...this.rows.values()].filter((row) => row.isActive).length,
    };
  }
}

function harness(pages: NotionPageSnapshot[]) {
  const dishes = new MemoryDishes();
  return {
    dishes,
    run: () =>
      importNotionCatalog({
        loadPages: async () => pages,
        dishes,
      }),
  };
}

describe("importNotionCatalog", () => {
  it("imports recipes with steps whether or not they were tried", async () => {
    const first = harness([
      snapshot(TRIED, "  红烧肉<br /> ", true),
      snapshot(OTHER, "青菜", false),
      snapshot(PLAIN, "只有图", true, [
        {
          id: "img",
          type: "image",
          image: { type: "file", file: { url: "https://cdn.example/a.jpg" } },
        },
      ]),
    ]);
    const report = await first.run();

    expect(report).toMatchObject({
      imported: 2,
      tried: 1,
      noSteps: 1,
      added: 2,
      updated: 0,
      deleted: 0,
      inactivated: 0,
      onWall: 2,
      skipped: [],
    });
    expect(first.dishes.rows.size).toBe(2);
    expect(first.dishes.rows.get(TRIED)?.tried).toBe(true);
    expect(first.dishes.rows.get(OTHER)?.tried).toBe(false);
    expect(first.dishes.rows.has(PLAIN)).toBe(false);
    expect(formatImportReport(report)).toContain("做过 1");
    expect(formatImportReport(report)).toContain("没有步骤 1");
    expect(formatImportReport(report)).not.toContain("未尝试");

    const again = harness([
      snapshot(TRIED.replaceAll("-", ""), "红烧肉", true),
      snapshot(OTHER, "青菜", false),
    ]);
    again.dishes.rows = first.dishes.rows;
    const second = await again.run();
    expect(second.added).toBe(0);
    expect(second.updated).toBe(2);
    expect(again.dishes.rows.size).toBe(2);
    expect(again.dishes.rows.get(TRIED)?.id).toBe("dish-1");
  });

  it("keeps an unchecked dish and syncs tried to false", async () => {
    const seeded = harness([snapshot(TRIED, "红烧肉", true)]);
    await seeded.run();
    const keptId = seeded.dishes.rows.get(TRIED)?.id;

    const unchecked = harness([snapshot(TRIED, "红烧肉", false)]);
    unchecked.dishes.rows = seeded.dishes.rows;
    unchecked.dishes.referenced = seeded.dishes.referenced;
    const report = await unchecked.run();
    expect(report).toMatchObject({
      imported: 1,
      tried: 0,
      deleted: 0,
      inactivated: 0,
      updated: 1,
    });
    expect(unchecked.dishes.rows.get(TRIED)).toMatchObject({
      id: keptId,
      tried: false,
      isActive: true,
    });
  });

  it("deletes a dish that lost its steps when no menu references it", async () => {
    const seeded = harness([snapshot(TRIED, "红烧肉", true)]);
    await seeded.run();

    const empty = harness([
      snapshot(TRIED, "红烧肉", true, [
        {
          id: "h",
          type: "heading_2",
          heading_2: { rich_text: [{ plain_text: "步骤" }] },
        },
      ]),
    ]);
    empty.dishes.rows = seeded.dishes.rows;
    const report = await empty.run();
    expect(report).toMatchObject({
      imported: 0,
      noSteps: 1,
      deleted: 1,
      inactivated: 0,
    });
    expect(empty.dishes.rows.has(TRIED)).toBe(false);
  });

  it("inactivates a dish that lost its steps when a menu still references it", async () => {
    const seeded = harness([snapshot(TRIED, "红烧肉", true)]);
    await seeded.run();
    const keptId = seeded.dishes.rows.get(TRIED)?.id;

    const empty = harness([snapshot(TRIED, "红烧肉", true, [])]);
    empty.dishes.rows = seeded.dishes.rows;
    empty.dishes.referenced.add(TRIED);
    const report = await empty.run();
    expect(report).toMatchObject({
      noSteps: 1,
      deleted: 0,
      inactivated: 1,
    });
    expect(empty.dishes.rows.get(TRIED)).toMatchObject({
      id: keptId,
      isActive: false,
    });
  });

  it("deletes a Notion-deleted dish with no menu row and inactivates one that is planned", async () => {
    const seeded = harness([
      snapshot(TRIED, "红烧肉", true),
      snapshot(OTHER, "青菜", true),
    ]);
    await seeded.run();
    const keptId = seeded.dishes.rows.get(OTHER)?.id;

    const removed = harness([]);
    removed.dishes.rows = seeded.dishes.rows;
    removed.dishes.referenced.add(OTHER);
    const report = await removed.run();
    expect(report).toMatchObject({ deleted: 1, inactivated: 1 });
    expect(removed.dishes.rows.has(TRIED)).toBe(false);
    expect(removed.dishes.rows.get(OTHER)).toMatchObject({
      id: keptId,
      isActive: false,
    });
  });

  it("does not delete when the Notion read fails", async () => {
    const dishes = new MemoryDishes();
    dishes.rows.set(TRIED, {
      id: "dish-1",
      notionPageId: TRIED,
      name: "红烧肉",
      isActive: true,
      tried: true,
      hasBody: true,
      categoryName: "大荤",
    });
    await expect(
      importNotionCatalog({
        loadPages: async () => {
          throw new Error("Notion 请求失败（500）。");
        },
        dishes,
      }),
    ).rejects.toThrow("Notion 请求失败（500）。");
    expect(dishes.rows.get(TRIED)?.isActive).toBe(true);
  });

  it("strips tokens and signed urls from sync errors", () => {
    const message = safeSyncError(
      new Error(
        "failed Bearer ntn_supersecretvalue https://cdn.example/a.jpg?sig=1",
      ),
    );
    expect(message).not.toContain("ntn_supersecretvalue");
    expect(message).not.toContain("sig=1");
    expect(message).toContain("[链接]");
  });
});
