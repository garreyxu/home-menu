import { describe, expect, it } from "vitest";

import {
  importNotionCatalog,
  type DishRepository,
  type StoredNotionDish,
  type UpsertDish,
} from "@/server/notion/import-catalog";
import { formatImportReport, safeSyncError } from "@/server/notion/report";
import type { NotionPageSnapshot } from "@/server/notion/types";
import type { PhotoStore } from "@/server/photos/store";

const JPEG = Uint8Array.of(0xff, 0xd8, 0xff, 0x00);
const TRIED = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function snapshot(
  id: string,
  name: string,
  tried: boolean,
  options?: {
    blocks?: NotionPageSnapshot["blocks"];
    cover?: NotionPageSnapshot["cover"];
    imageUrl?: string;
  },
): NotionPageSnapshot {
  const blocks = options?.blocks ?? [
    {
      id: `${id}-img`,
      type: "image",
      image: {
        type: "file",
        file: {
          url:
            options?.imageUrl ??
            "https://cdn.example/dish.jpg?X-Amz-Signature=one",
        },
      },
    },
    {
      id: `${id}-step`,
      type: "paragraph",
      paragraph: { rich_text: [{ plain_text: "做法" }] },
    },
  ];
  return {
    id,
    properties: {
      菜名: { type: "title", title: [{ plain_text: name }] },
      "已尝试?": { type: "checkbox", checkbox: tried },
      类型: { type: "select", select: { name: "大荤" } },
    },
    cover:
      options?.cover === undefined
        ? {
            type: "external",
            external: { url: "https://images.example/cover.jpg?sig=1" },
          }
        : options.cover,
    blocks,
  };
}

class MemoryDishes implements DishRepository {
  rows = new Map<
    string,
    StoredNotionDish & { hasBody: boolean; categoryName: string }
  >();

  async listNotionDishes(): Promise<StoredNotionDish[]> {
    return [...this.rows.values()].map((row) => ({
      id: row.id,
      notionPageId: row.notionPageId,
      name: row.name,
      photoKey: row.photoKey,
      photoSourceKey: row.photoSourceKey,
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

  async delist(notionPageIds: readonly string[]) {
    let count = 0;
    for (const id of notionPageIds) {
      const row = this.rows.get(id);
      if (!row?.isActive) continue;
      row.isActive = false;
      count += 1;
    }
    return count;
  }

  async countOnWall() {
    const visible = [...this.rows.values()].filter(
      (row) => row.isActive && row.hasBody,
    );
    return {
      onWall: visible.length,
      onWallWithPhoto: visible.filter((row) => row.photoKey).length,
    };
  }
}

class MemoryPhotos implements PhotoStore {
  objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  puts = 0;

  async put(key: string, bytes: Uint8Array, contentType: string) {
    this.puts += 1;
    this.objects.set(key, { bytes, contentType });
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

function harness(pages: NotionPageSnapshot[], storageConfigured = true) {
  const dishes = new MemoryDishes();
  const photos = new MemoryPhotos();
  const downloads: string[] = [];
  return {
    dishes,
    photos,
    downloads,
    run: () =>
      importNotionCatalog({
        loadPages: async () => pages,
        download: async (url) => {
          downloads.push(url);
          return { bytes: JPEG, contentType: "image/jpeg" };
        },
        photos,
        dishes,
        storageConfigured,
      }),
  };
}

describe("importNotionCatalog", () => {
  it("imports only tried dishes, dedupes by page id, and reports counts", async () => {
    const stableBlocks = [
      {
        id: "img-stable",
        type: "image" as const,
        image: {
          type: "file" as const,
          file: { url: "https://cdn.example/dish.jpg?X-Amz-Signature=one" },
        },
      },
      {
        id: "step",
        type: "paragraph" as const,
        paragraph: { rich_text: [{ plain_text: "做法" }] },
      },
    ];
    const first = harness([
      snapshot(TRIED, "  红烧肉<br /> ", true, { blocks: stableBlocks }),
      snapshot(OTHER, "青菜", false),
    ]);
    const report = await first.run();

    expect(report).toMatchObject({
      imported: 1,
      withPhoto: 1,
      placeholder: 0,
      added: 1,
      updated: 0,
      delisted: 0,
      onWall: 1,
      onWallWithPhoto: 1,
      notTried: 1,
      skipped: [],
    });
    expect(first.dishes.rows.size).toBe(1);
    expect(first.downloads).toEqual([
      "https://cdn.example/dish.jpg?X-Amz-Signature=one",
    ]);
    expect(first.photos.puts).toBe(1);
    expect(formatImportReport(report)).toContain("未尝试、未导入 1");
    expect(formatImportReport(report)).toContain("上墙 1");

    const again = harness([
      snapshot(TRIED.replaceAll("-", ""), "红烧肉", true, {
        blocks: [
          {
            ...stableBlocks[0],
            image: {
              type: "file",
              file: {
                url: "https://cdn.example/dish.jpg?X-Amz-Signature=two",
              },
            },
          },
          stableBlocks[1],
        ],
      }),
      snapshot(OTHER, "青菜", false),
    ]);
    again.dishes.rows = first.dishes.rows;
    again.photos.objects = first.photos.objects;
    const second = await again.run();
    expect(second.added).toBe(0);
    expect(second.updated).toBe(1);
    expect(again.dishes.rows.size).toBe(1);
    expect(again.photos.puts).toBe(0);
    expect(again.dishes.rows.get(TRIED)?.id).toBe("dish-1");
  });

  it("delists an unchecked or deleted dish without removing the row", async () => {
    const seeded = harness([snapshot(TRIED, "红烧肉", true)]);
    await seeded.run();
    const keptId = seeded.dishes.rows.get(TRIED)?.id;

    const unchecked = harness([snapshot(TRIED, "红烧肉", false)]);
    unchecked.dishes.rows = seeded.dishes.rows;
    const uncheckedReport = await unchecked.run();
    expect(uncheckedReport.delisted).toBe(1);
    expect(uncheckedReport.imported).toBe(0);
    expect(unchecked.dishes.rows.get(TRIED)?.isActive).toBe(false);
    expect(unchecked.dishes.rows.get(TRIED)?.id).toBe(keptId);
    expect(unchecked.downloads).toEqual([]);

    const revived = harness([snapshot(TRIED, "红烧肉改名", true)]);
    revived.dishes.rows = unchecked.dishes.rows;
    const revivedReport = await revived.run();
    expect(revivedReport.added).toBe(0);
    expect(revivedReport.updated).toBe(1);
    expect(revived.dishes.rows.get(TRIED)).toMatchObject({
      id: keptId,
      name: "红烧肉改名",
      isActive: true,
    });

    const removed = harness([]);
    removed.dishes.rows = revived.dishes.rows;
    const removedReport = await removed.run();
    expect(removedReport.delisted).toBe(1);
    expect(removed.dishes.rows.get(TRIED)?.isActive).toBe(false);
    expect(removed.dishes.rows.get(TRIED)?.id).toBe(keptId);
  });

  it("uses the body image, then the cover, then a placeholder", async () => {
    const body = harness([
      snapshot(TRIED, "红烧肉", true, {
        imageUrl: "https://cdn.example/body.jpg",
        cover: {
          type: "external",
          external: { url: "https://images.example/cover.jpg" },
        },
      }),
    ]);
    await body.run();
    expect(body.downloads).toEqual(["https://cdn.example/body.jpg"]);

    const cover = harness([
      snapshot(OTHER, "清蒸鱼", true, {
        blocks: [
          {
            id: "step",
            type: "paragraph",
            paragraph: { rich_text: [{ plain_text: "蒸" }] },
          },
        ],
        cover: {
          type: "file",
          file: { url: "https://cdn.example/cover-only.jpg?sig=9" },
        },
      }),
    ]);
    await cover.run();
    expect(cover.downloads).toEqual([
      "https://cdn.example/cover-only.jpg?sig=9",
    ]);

    const plain = harness([
      snapshot("cccccccc-cccc-cccc-cccc-cccccccccccc", "白粥", true, {
        blocks: [
          {
            id: "step",
            type: "paragraph",
            paragraph: { rich_text: [{ plain_text: "煮" }] },
          },
        ],
        cover: null,
      }),
    ]);
    const plainReport = await plain.run();
    expect(plain.downloads).toEqual([]);
    expect(plainReport).toMatchObject({
      imported: 1,
      withPhoto: 0,
      placeholder: 1,
      onWall: 1,
      onWallWithPhoto: 0,
    });
  });

  it("imports an empty body but keeps it off the wall", async () => {
    const run = harness([
      snapshot(TRIED, "还没写", true, { blocks: [], cover: null }),
    ]);
    const report = await run.run();
    expect(report).toMatchObject({
      imported: 1,
      placeholder: 1,
      onWall: 0,
      added: 1,
    });
    expect(run.dishes.rows.get(TRIED)?.hasBody).toBe(false);
    expect(run.dishes.rows.get(TRIED)?.isActive).toBe(true);
  });

  it("does not delist when the Notion read fails", async () => {
    const dishes = new MemoryDishes();
    dishes.rows.set(TRIED, {
      id: "dish-1",
      notionPageId: TRIED,
      name: "红烧肉",
      photoKey: "dishes/old",
      photoSourceKey: "body:old",
      isActive: true,
      hasBody: true,
      categoryName: "大荤",
    });
    await expect(
      importNotionCatalog({
        loadPages: async () => {
          throw new Error("Notion 请求失败（500）。");
        },
        download: async () => {
          throw new Error("should not download");
        },
        photos: new MemoryPhotos(),
        dishes,
        storageConfigured: true,
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
