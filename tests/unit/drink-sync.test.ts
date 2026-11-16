import { describe, expect, it, vi } from "vitest";

import { describeSync } from "@/lib/sync-note";
import { openNotionRead, NotionRequestError } from "@/server/notion/client";
import { downloadDrinkPhoto } from "@/server/notion/drink-photo";
import {
  DRINKS_DATABASE_ID,
  DRINKS_DATA_SOURCE_ID,
} from "@/server/notion/config";
import {
  DRINKS_ACCESS_NOTE,
  DRINKS_READ_FAILED,
  isDrinksAccessFailure,
  syncDrinkCatalog,
  type DrinkRepository,
} from "@/server/notion/drink-sync";
import type { ImportReport } from "@/server/notion/report";

const SIGNED =
  "https://prod-files-secure.s3.us-west-2.amazonaws.com/night.jpg?X-Amz-Signature=abc";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function repo(
  stored: DrinkRepository["listStored"] extends () => Promise<infer T>
    ? T
    : never,
): DrinkRepository & {
  upsert: ReturnType<typeof vi.fn>;
  deactivate: ReturnType<typeof vi.fn>;
} {
  return {
    listStored: vi.fn(async () => stored),
    upsert: vi.fn(async () => "added" as const),
    deactivate: vi.fn(async (ids: readonly string[]) => ids.length),
  };
}

describe("drink database ids", () => {
  it("keeps the cocktail database next to the recipe configuration", () => {
    expect(DRINKS_DATABASE_ID).toBe("419758b3-080f-8168-bd89-cbb70785af72");
    expect(DRINKS_DATA_SOURCE_ID).toBe("419758b3-080f-8111-9560-000b305e6c3e");
  });
});

describe("drink photo download", () => {
  it("does not follow a redirect off the allowed hosts", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/latest" },
      });
    });
    await expect(
      downloadDrinkPhoto(
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/a.jpg",
        fetchImpl,
      ),
    ).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps a small image from an allowed host", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(Uint8Array.from([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    });
    await expect(
      downloadDrinkPhoto(
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/a.jpg?X-Amz-Signature=abc",
        fetchImpl,
      ),
    ).resolves.toEqual({
      base64: Buffer.from([1, 2, 3]).toString("base64"),
      contentType: "image/png",
    });
  });
});

describe("drinks access failures", () => {
  it.each([
    [403, null],
    [404, null],
    [400, "object_not_found"],
  ] as const)("treats HTTP %s %s as no access", (status, code) => {
    expect(
      isDrinksAccessFailure(new NotionRequestError("hidden", status, code)),
    ).toBe(true);
  });

  it("does not treat a token or server failure as a missing share", () => {
    expect(isDrinksAccessFailure(new NotionRequestError("no", 401, null))).toBe(
      false,
    );
    expect(isDrinksAccessFailure(new NotionRequestError("no", 500, null))).toBe(
      false,
    );
    expect(isDrinksAccessFailure(new Error("object_not_found"))).toBe(false);
  });

  it("reads object_not_found from the drinks database without failing the caller open", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      expect(url).toContain(`/databases/${DRINKS_DATABASE_ID}`);
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer ntn_secret",
      );
      return json(
        {
          object: "error",
          status: 404,
          code: "object_not_found",
          message: "https://secret.example/do-not-keep ntn_secret",
        },
        404,
      );
    };
    const session = openNotionRead({
      token: "ntn_secret",
      databaseId: "11111111-1111-4111-8111-111111111111",
      dataSourceId: "22222222-2222-4222-8222-222222222222",
      fetchImpl,
      minIntervalMs: 0,
    });
    await expect(session.listDrinks()).rejects.toMatchObject({
      status: 404,
      code: "object_not_found",
    });
    try {
      await session.listDrinks();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      expect(message).not.toContain("ntn_secret");
      expect(message).not.toContain("secret.example");
    }
  });

  it("leaves stored drinks untouched and reports the access line", async () => {
    const drinks = repo([
      {
        notionPageId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        isActive: true,
        photoFingerprint: "keep",
      },
    ]);
    const note = await syncDrinkCatalog({
      list: async () => {
        throw new NotionRequestError("hidden", 403, "restricted_resource");
      },
      loadBlocks: async () => ({ status: "ok", blocks: [] }),
      repo: drinks,
      deadline: Number.POSITIVE_INFINITY,
    });
    expect(note).toBe(DRINKS_ACCESS_NOTE);
    expect(drinks.listStored).not.toHaveBeenCalled();
    expect(drinks.upsert).not.toHaveBeenCalled();
    expect(drinks.deactivate).not.toHaveBeenCalled();
  });

  it("turns a drinks server error into a retry line and still does not write", async () => {
    const drinks = repo([]);
    const note = await syncDrinkCatalog({
      list: async () => {
        throw new NotionRequestError("hidden", 500, null);
      },
      loadBlocks: async () => ({ status: "failed" }),
      repo: drinks,
      deadline: Number.POSITIVE_INFINITY,
    });
    expect(note).toBe(DRINKS_READ_FAILED);
    expect(drinks.upsert).not.toHaveBeenCalled();
    expect(drinks.deactivate).not.toHaveBeenCalled();
  });
});

describe("syncDrinkCatalog", () => {
  it("treats an empty database as zero drinks", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith(`/databases/${DRINKS_DATABASE_ID}`)) {
        return json({ data_sources: [{ id: DRINKS_DATA_SOURCE_ID }] });
      }
      if (url.endsWith(`/data_sources/${DRINKS_DATA_SOURCE_ID}/query`)) {
        return json({ results: [], has_more: false, next_cursor: null });
      }
      return json({ message: "unexpected" }, 500);
    };
    const session = openNotionRead({
      token: "ntn_secret",
      databaseId: "11111111-1111-4111-8111-111111111111",
      dataSourceId: "22222222-2222-4222-8222-222222222222",
      fetchImpl,
      minIntervalMs: 0,
    });
    const drinks = repo([]);
    const note = await syncDrinkCatalog({
      list: () => session.listDrinks(),
      loadBlocks: async () => ({ status: "ok", blocks: [] }),
      repo: drinks,
      deadline: Number.POSITIVE_INFINITY,
    });
    expect(note).toBe("酒单：导入 0 杯，新增 0，更新 0，下架 0。");
    expect(drinks.deactivate).not.toHaveBeenCalled();
  });

  it("does not deactivate existing drinks when Notion returns nothing", async () => {
    const drinks = repo([
      {
        notionPageId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        isActive: true,
        photoFingerprint: null,
      },
    ]);
    const note = await syncDrinkCatalog({
      list: async () => [],
      loadBlocks: async () => ({ status: "ok", blocks: [] }),
      repo: drinks,
      deadline: Number.POSITIVE_INFINITY,
    });
    expect(note).toBe("酒单：0 杯。已有的先留着，请检查 Notion。");
    expect(drinks.deactivate).not.toHaveBeenCalled();
    expect(drinks.upsert).not.toHaveBeenCalled();
  });

  it("stores a drink without the Notion photo URL and deactivates pages that left", async () => {
    const kept = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const gone = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const drinks = repo([
      { notionPageId: gone, isActive: true, photoFingerprint: "old" },
    ]);
    drinks.upsert.mockResolvedValue("added");
    const note = await syncDrinkCatalog({
      list: async () => [
        {
          id: kept,
          archived: false,
          inTrash: false,
          cover: null,
          properties: {
            酒名: { type: "title", title: [{ plain_text: "夜来香" }] },
            基酒: { type: "multi_select", multi_select: [{ name: "金酒" }] },
            照片: {
              type: "files",
              files: [{ type: "file", file: { url: SIGNED } }],
            },
          },
        },
      ],
      loadBlocks: async () => ({
        status: "ok",
        blocks: [
          {
            id: "step",
            type: "paragraph",
            paragraph: { rich_text: [{ plain_text: "搅拌" }] },
          },
        ],
      }),
      downloadPhoto: async () => ({
        base64: "aGk=",
        contentType: "image/png",
      }),
      repo: drinks,
      deadline: Number.POSITIVE_INFINITY,
    });
    expect(note).toBe("酒单：导入 1 杯，新增 1，更新 0，下架 1。");
    expect(drinks.deactivate).toHaveBeenCalledWith([gone]);
    const written = drinks.upsert.mock.calls[0]?.[0];
    expect(written.drink.name).toBe("夜来香");
    expect(JSON.stringify(written.drink)).not.toContain("X-Amz-Signature");
    expect(written.photo).toEqual({
      kind: "set",
      photo: {
        base64: "aGk=",
        contentType: "image/png",
        fingerprint: expect.any(String),
      },
    });
    expect(written.photo.photo.fingerprint).not.toContain("http");
  });

  it("shows the access line on the sync note", () => {
    const report = {
      imported: 1,
      partial: false,
      deferred: 0,
      tried: 0,
      noSteps: 0,
      errored: 0,
      seedsRetired: 0,
      added: 1,
      updated: 0,
      deleted: 0,
      inactivated: 0,
      wouldRemove: 0,
      removalsSkipped: false,
      onWall: 1,
      skipped: [],
      noStepPages: [],
      erroredPages: [],
      warnings: [DRINKS_ACCESS_NOTE],
    } satisfies ImportReport;
    expect(describeSync({ running: false, report, error: null })).toContain(
      DRINKS_ACCESS_NOTE,
    );
  });
});
