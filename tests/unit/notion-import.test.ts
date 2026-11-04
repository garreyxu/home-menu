import { describe, expect, it } from "vitest";

import {
  importNotionCatalog,
  type DishRepository,
  type StoredNotionDish,
  type UpsertDish,
} from "@/server/notion/import-catalog";
import {
  formatImportReport,
  removalSkippedNotice,
  safeSyncError,
} from "@/server/notion/report";
import type { NotionBlock, NotionPageSnapshot } from "@/server/notion/types";

const TRIED = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PLAIN = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function dishId(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function seedActive(dishes: MemoryDishes, count: number) {
  for (let index = 0; index < count; index += 1) {
    const id = dishId(index);
    dishes.rows.set(id, {
      id: `dish-${index}`,
      notionPageId: id,
      name: `菜${index}`,
      isActive: true,
      tried: true,
      hasBody: true,
      categoryName: "大荤",
    });
  }
}

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

  private plan(notionPageIds: readonly string[]) {
    let deleted = 0;
    let inactivated = 0;
    const deleteIds: string[] = [];
    const inactivateIds: string[] = [];
    for (const id of notionPageIds) {
      const row = this.rows.get(id);
      if (!row) continue;
      if (this.referenced.has(id)) {
        if (row.isActive) {
          inactivateIds.push(id);
          inactivated += 1;
        }
      } else {
        deleteIds.push(id);
        deleted += 1;
      }
    }
    return { deleted, inactivated, deleteIds, inactivateIds };
  }

  async removalPlan(notionPageIds: readonly string[]) {
    const planned = this.plan(notionPageIds);
    return { deleted: planned.deleted, inactivated: planned.inactivated };
  }

  async retire(notionPageIds: readonly string[]) {
    const planned = this.plan(notionPageIds);
    for (const id of planned.deleteIds) this.rows.delete(id);
    for (const id of planned.inactivateIds) {
      const row = this.rows.get(id);
      if (row) row.isActive = false;
    }
    return { deleted: planned.deleted, inactivated: planned.inactivated };
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

    const removed = harness([snapshot(PLAIN, "还在", true)]);
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

  it("does not remove anything when Notion returns zero pages", async () => {
    const run = harness([]);
    seedActive(run.dishes, 2);
    const report = await run.run();
    expect(report).toMatchObject({
      deleted: 0,
      inactivated: 0,
      wouldRemove: 2,
      removalsSkipped: true,
    });
    expect(run.dishes.rows.size).toBe(2);
    expect([...run.dishes.rows.values()].every((row) => row.isActive)).toBe(
      true,
    );
    expect(formatImportReport(report)).toContain(removalSkippedNotice(2));
  });

  it("applies a single removal when 1 of 20 active dishes is gone", async () => {
    const missing = dishId(0);
    const run = harness(
      Array.from({ length: 19 }, (_, index) =>
        snapshot(dishId(index + 1), `菜${index + 1}`, true),
      ),
    );
    seedActive(run.dishes, 20);
    const report = await run.run();
    expect(report).toMatchObject({
      deleted: 1,
      inactivated: 0,
      wouldRemove: 1,
      removalsSkipped: false,
    });
    expect(run.dishes.rows.has(missing)).toBe(false);
    expect(run.dishes.rows.size).toBe(19);
  });

  it("skips every removal when 10 of 20 active dishes would be removed", async () => {
    const kept = dishId(0);
    const missing = dishId(10);
    const fresh = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const run = harness([
      snapshot(kept, "改名了", true),
      ...Array.from({ length: 9 }, (_, index) =>
        snapshot(dishId(index + 1), `菜${index + 1}`, true),
      ),
      snapshot(fresh, "新菜", true),
    ]);
    seedActive(run.dishes, 20);
    const report = await run.run();
    expect(report).toMatchObject({
      added: 1,
      updated: 10,
      deleted: 0,
      inactivated: 0,
      wouldRemove: 10,
      removalsSkipped: true,
    });
    expect(run.dishes.rows.get(kept)?.name).toBe("改名了");
    expect(run.dishes.rows.get(missing)?.isActive).toBe(true);
    expect(run.dishes.rows.size).toBe(21);
    expect(formatImportReport(report)).toContain("先没动，请检查 Notion");
  });

  it("removes the large set only when mass removal is allowed", async () => {
    const pages = Array.from({ length: 10 }, (_, index) =>
      snapshot(dishId(index), `菜${index}`, true),
    );
    const dishes = new MemoryDishes();
    seedActive(dishes, 20);
    const report = await importNotionCatalog({
      loadPages: async () => pages,
      dishes,
      allowMassRemoval: true,
    });
    expect(report).toMatchObject({
      deleted: 10,
      removalsSkipped: false,
      wouldRemove: 10,
    });
    expect(dishes.rows.size).toBe(10);
  });

  it("leaves a dish untouched when its block fetch failed", async () => {
    const run = harness([
      {
        ...snapshot(TRIED, "改名了", false),
        blocks: null,
        blocksError: "正文读取失败",
        fetchError: "正文读取失败",
      },
      snapshot(OTHER, "青菜", true),
    ]);
    run.dishes.rows.set(TRIED, {
      id: "dish-1",
      notionPageId: TRIED,
      name: "红烧肉",
      isActive: true,
      tried: true,
      hasBody: true,
      categoryName: "大荤",
    });
    const report = await run.run();
    expect(report.errored).toBe(1);
    expect(report.deleted).toBe(0);
    expect(report.inactivated).toBe(0);
    expect(run.dishes.rows.get(TRIED)).toMatchObject({
      name: "红烧肉",
      tried: true,
      isActive: true,
    });
    expect(run.dishes.rows.get(OTHER)?.name).toBe("青菜");
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
