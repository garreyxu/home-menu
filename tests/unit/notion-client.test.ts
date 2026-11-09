import { describe, expect, it } from "vitest";

import { fetchNotionSnapshots, openNotionRead } from "@/server/notion/client";

const DATABASE = "ff95d9e8-3ae1-44ff-aaa4-61286c9652ad";
const DATA_SOURCE = "b8a7d4f9-5bfd-4ed3-bacd-5a5298796038";
const TRIED = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const UNTRIED = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TOKEN = "ntn_supersecretvalue";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchNotionSnapshots", () => {
  it("queries the data source, follows the cursor, and reads every page body", async () => {
    const calls: { url: string; body?: string; version?: string | null }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({
        url,
        body: typeof init?.body === "string" ? init.body : undefined,
        version: new Headers(init?.headers).get("Notion-Version"),
      });
      if (url.endsWith(`/databases/${DATABASE}`)) {
        return json({
          data_sources: [{ id: DATA_SOURCE, name: "Recipe" }],
        });
      }
      if (url.endsWith(`/data_sources/${DATA_SOURCE}`)) {
        return json({
          properties: {
            菜名: { type: "title" },
            "已尝试?": { type: "checkbox" },
          },
        });
      }
      if (url.endsWith(`/data_sources/${DATA_SOURCE}/query`)) {
        const body = JSON.parse(String(init?.body)) as {
          start_cursor?: string;
        };
        if (!body.start_cursor) {
          return json({
            results: [
              {
                id: UNTRIED,
                properties: {
                  菜名: { type: "title", title: [{ plain_text: "青菜" }] },
                  "已尝试?": { type: "checkbox", checkbox: false },
                },
                cover: null,
              },
            ],
            has_more: true,
            next_cursor: "cursor-2",
          });
        }
        return json({
          results: [
            {
              id: TRIED,
              properties: {
                菜名: { type: "title", title: [{ plain_text: "红烧肉" }] },
                "已尝试?": { type: "checkbox", checkbox: true },
              },
              cover: null,
            },
          ],
          has_more: false,
          next_cursor: null,
        });
      }
      if (url.includes(`/blocks/${TRIED}/children`)) {
        return json({
          results: [
            {
              id: "step",
              type: "paragraph",
              paragraph: { rich_text: [{ plain_text: "炖" }] },
              has_children: false,
            },
          ],
          has_more: false,
          next_cursor: null,
        });
      }
      if (url.includes(`/blocks/${UNTRIED}/children`)) {
        return json({
          results: [
            {
              id: "greens",
              type: "paragraph",
              paragraph: { rich_text: [{ plain_text: "焯水" }] },
              has_children: false,
            },
          ],
          has_more: false,
          next_cursor: null,
        });
      }
      return json({ message: "unexpected" }, 500);
    };

    const batch = await fetchNotionSnapshots({
      token: TOKEN,
      databaseId: DATABASE,
      dataSourceId: DATA_SOURCE,
      fetchImpl,
      minIntervalMs: 0,
    });
    const pages = batch.pages;

    expect(batch.mainIngredientOptions).toEqual([]);
    expect(calls.map((call) => call.version)).toEqual([
      "2026-03-11",
      "2026-03-11",
      "2026-03-11",
      "2026-03-11",
      "2026-03-11",
      "2026-03-11",
    ]);
    expect(calls[2]?.body).not.toContain("start_cursor");
    expect(calls[3]?.body).toContain("cursor-2");
    expect(
      calls.some(
        (call) =>
          call.url.includes("/databases/") && call.url.includes("/query"),
      ),
    ).toBe(false);
    expect(pages.map((page) => page.id)).toEqual([UNTRIED, TRIED]);
    expect(pages[0]?.blocks).toEqual([
      expect.objectContaining({ id: "greens", type: "paragraph" }),
    ]);
    expect(pages[1]?.blocks).toEqual([
      expect.objectContaining({ id: "step", type: "paragraph" }),
    ]);
  });

  it("follows the cursor for a block's children and keeps one nested list", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith(`/databases/${DATABASE}`)) {
        return json({ data_sources: [{ id: DATA_SOURCE }] });
      }
      if (url.endsWith(`/data_sources/${DATA_SOURCE}`)) {
        return json({
          properties: {
            菜名: { type: "title" },
            "已尝试?": { type: "checkbox" },
          },
        });
      }
      if (url.endsWith(`/data_sources/${DATA_SOURCE}/query`)) {
        return json({
          results: [
            {
              id: TRIED,
              properties: {
                菜名: { type: "title", title: [{ plain_text: "红烧肉" }] },
                "已尝试?": { type: "checkbox", checkbox: true },
              },
            },
          ],
          has_more: false,
          next_cursor: null,
        });
      }
      if (url.includes(`/blocks/${TRIED}/children`)) {
        const cursor = new URL(url).searchParams.get("start_cursor");
        if (!cursor) {
          return json({
            results: [
              {
                id: "outer",
                type: "bulleted_list_item",
                has_children: true,
                bulleted_list_item: { rich_text: [{ plain_text: "外" }] },
              },
            ],
            has_more: true,
            next_cursor: "child-2",
          });
        }
        return json({
          results: [
            {
              id: "later",
              type: "paragraph",
              has_children: false,
              paragraph: { rich_text: [{ plain_text: "后" }] },
            },
          ],
          has_more: false,
          next_cursor: null,
        });
      }
      if (url.includes("/blocks/outer/children")) {
        return json({
          results: [
            {
              id: "inner",
              type: "bulleted_list_item",
              has_children: false,
              bulleted_list_item: { rich_text: [{ plain_text: "内" }] },
            },
          ],
          has_more: false,
          next_cursor: null,
        });
      }
      return json({ message: "unexpected" }, 500);
    };

    const { pages } = await fetchNotionSnapshots({
      token: TOKEN,
      databaseId: DATABASE,
      dataSourceId: DATA_SOURCE,
      fetchImpl,
      minIntervalMs: 0,
    });

    expect(calls.some((url) => url.includes("start_cursor=child-2"))).toBe(
      true,
    );
    expect(pages[0]?.blocks).toEqual([
      expect.objectContaining({
        id: "outer",
        children: [expect.objectContaining({ id: "inner" })],
      }),
      expect.objectContaining({ id: "later" }),
    ]);
  });

  it("stops before the first block request when the deadline has passed", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return json({ message: "should not be called" }, 500);
    };
    const session = openNotionRead({
      token: TOKEN,
      databaseId: DATABASE,
      dataSourceId: DATA_SOURCE,
      fetchImpl,
      minIntervalMs: 0,
    });
    await expect(session.loadBlocks(TRIED, 0)).resolves.toEqual({
      status: "timeout",
    });
    expect(calls).toBe(0);
  });

  it("stops before changing anything when 已尝试? is not a checkbox", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/databases/")) {
        return json({ data_sources: [{ id: DATA_SOURCE }] });
      }
      return json({
        properties: { "已尝试?": { type: "select" } },
      });
    };

    await expect(
      fetchNotionSnapshots({
        token: TOKEN,
        databaseId: DATABASE,
        dataSourceId: DATA_SOURCE,
        fetchImpl,
        minIntervalMs: 0,
      }),
    ).rejects.toThrow("没有改菜单");
  });

  it("keeps a page when its block request fails after the query succeeds", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith(`/databases/${DATABASE}`)) {
        return json({ data_sources: [{ id: DATA_SOURCE }] });
      }
      if (url.endsWith(`/data_sources/${DATA_SOURCE}`)) {
        return json({
          properties: {
            菜名: { type: "title" },
            "已尝试?": { type: "checkbox" },
          },
        });
      }
      if (url.endsWith(`/data_sources/${DATA_SOURCE}/query`)) {
        return json({
          results: [
            {
              id: TRIED,
              properties: {
                菜名: { type: "title", title: [{ plain_text: "红烧肉" }] },
                "已尝试?": { type: "checkbox", checkbox: true },
              },
            },
            {
              id: UNTRIED,
              properties: null,
            },
          ],
          has_more: false,
          next_cursor: null,
        });
      }
      if (url.includes(`/blocks/${TRIED}/children`)) {
        return json({ message: "unavailable" }, 500);
      }
      if (url.includes(`/blocks/${UNTRIED}/`)) {
        return json({
          results: [],
          has_more: false,
          next_cursor: null,
        });
      }
      return json({ message: "unexpected" }, 500);
    };

    const { pages } = await fetchNotionSnapshots({
      token: TOKEN,
      databaseId: DATABASE,
      dataSourceId: DATA_SOURCE,
      fetchImpl,
      minIntervalMs: 0,
    });

    expect(pages.map((page) => page.id)).toEqual([TRIED, UNTRIED]);
    expect(pages[0]?.blocks).toBeNull();
    expect(pages[0]?.fetchError).toBe("正文读取失败");
    expect(pages[1]?.fetchError).toBe("属性读取失败");
  });

  it("reads 主要食材种类 options in Notion's order", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/databases/")) {
        return json({ data_sources: [{ id: DATA_SOURCE }] });
      }
      if (url.endsWith(`/data_sources/${DATA_SOURCE}`)) {
        return json({
          properties: {
            "已尝试?": { type: "checkbox" },
            主要食材种类: {
              type: "select",
              select: {
                options: [
                  { name: "猪" },
                  { name: "  鸭  " },
                  { name: "" },
                  { name: "鸭" },
                  { name: "其他" },
                ],
              },
            },
          },
        });
      }
      if (url.endsWith(`/data_sources/${DATA_SOURCE}/query`)) {
        return json({ results: [], has_more: false, next_cursor: null });
      }
      return json({ message: "unexpected" }, 500);
    };

    const batch = await fetchNotionSnapshots({
      token: TOKEN,
      databaseId: DATABASE,
      dataSourceId: DATA_SOURCE,
      fetchImpl,
      minIntervalMs: 0,
    });
    expect(batch.pages).toEqual([]);
    expect(batch.mainIngredientOptions).toEqual(["猪", "鸭", "其他"]);
  });

  it("does not include the token when Notion rejects the request", async () => {
    const fetchImpl: typeof fetch = async () => json({ message: TOKEN }, 401);
    await expect(
      fetchNotionSnapshots({
        token: TOKEN,
        databaseId: DATABASE,
        dataSourceId: DATA_SOURCE,
        fetchImpl,
        minIntervalMs: 0,
      }),
    ).rejects.toThrow(/NOTION_TOKEN/);
    try {
      await fetchNotionSnapshots({
        token: TOKEN,
        databaseId: DATABASE,
        dataSourceId: DATA_SOURCE,
        fetchImpl,
        minIntervalMs: 0,
      });
    } catch (error) {
      expect(error instanceof Error ? error.message : "").not.toContain(TOKEN);
    }
  });
});
