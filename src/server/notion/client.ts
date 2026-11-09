import { readBlockChildrenPage } from "@/server/notion/block-page";
import { MAIN_INGREDIENT_PROPERTY } from "@/server/notion/category-order";
import { normalizeNotionId } from "@/server/notion/ids";
import { assertTriedProperty } from "@/server/notion/map-page";
import type {
  NotionBlock,
  NotionFile,
  NotionPageSnapshot,
  NotionProperty,
} from "@/server/notion/types";

const NOTION_VERSION = "2026-03-11";
const MAX_DEPTH = 8;
const MAX_BLOCKS = 400;

export type NotionSnapshotBatch = {
  pages: NotionPageSnapshot[];
  /**
   * 「主要食材种类」 option names, in the data source's option order.
   * Empty when that select is missing. Used only to place unknown options.
   */
  mainIngredientOptions: readonly string[];
};

export type NotionListedPage = {
  id: string;
  archived: boolean;
  inTrash: boolean;
  properties: Record<string, NotionProperty>;
  cover: NotionFile | null;
  fetchError?: string;
};

export type NotionReadSession = {
  listPages: () => Promise<{
    pages: NotionListedPage[];
    mainIngredientOptions: readonly string[];
  }>;
  loadBlocks: (
    pageId: string,
    deadline: number,
  ) => Promise<
    | { status: "ok"; blocks: NotionBlock[] }
    | { status: "timeout" }
    | { status: "failed" }
  >;
};

export function openNotionRead(options: {
  token: string;
  databaseId: string;
  dataSourceId: string;
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
}): NotionReadSession {
  const fetchImpl = options.fetchImpl ?? fetch;
  const wait = createSlotter(options.minIntervalMs ?? 350);
  const notion = (path: string, init?: RequestInit) =>
    notionRequest(options.token, path, fetchImpl, wait, init);

  return {
    async listPages() {
      const database = await notion(`/databases/${options.databaseId}`);
      const dataSourceId = chooseDataSource(
        readDataSources(database),
        options.dataSourceId,
      );
      const dataSource = await notion(`/data_sources/${dataSourceId}`);
      assertTriedProperty(readSchemaProperties(dataSource));
      return {
        pages: await queryAllPages(dataSourceId, notion),
        mainIngredientOptions: readSelectOptionNames(
          dataSource,
          MAIN_INGREDIENT_PROPERTY,
        ),
      };
    },
    async loadBlocks(pageId, deadline) {
      try {
        const loaded = await loadTree(
          pageId,
          notion,
          0,
          { count: 0 },
          () => Date.now() >= deadline,
        );
        if (loaded === "timeout") return { status: "timeout" };
        return { status: "ok", blocks: loaded };
      } catch {
        return { status: "failed" };
      }
    },
  };
}

export async function fetchNotionSnapshots(options: {
  token: string;
  databaseId: string;
  dataSourceId: string;
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  onProgress?: (processed: number, total: number) => Promise<void>;
}): Promise<NotionSnapshotBatch> {
  const session = openNotionRead(options);
  const listed = await session.listPages();
  const pages = listed.pages;
  const mainIngredientOptions = listed.mainIngredientOptions;
  const blocksById = new Map<string, NotionBlock[] | null>();
  const errors = new Map<string, string>();

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (!page) continue;
    const loaded = await session.loadBlocks(page.id, Number.POSITIVE_INFINITY);
    if (loaded.status === "ok") blocksById.set(page.id, loaded.blocks);
    else {
      blocksById.set(page.id, null);
      errors.set(page.id, "正文读取失败");
    }
    if (options.onProgress) {
      try {
        await options.onProgress(index + 1, pages.length);
      } catch {
        // Progress is optional. A failed heartbeat must not abort the import.
      }
    }
  }

  return {
    mainIngredientOptions,
    pages: pages.map((page) => ({
      id: page.id,
      properties: page.properties,
      cover: page.cover,
      blocks: blocksById.get(page.id) ?? null,
      blocksError: errors.get(page.id),
      fetchError: page.fetchError ?? errors.get(page.id),
    })),
  };
}

type NotionCaller = (path: string, init?: RequestInit) => Promise<unknown>;

async function queryAllPages(
  dataSourceId: string,
  notion: NotionCaller,
): Promise<NotionListedPage[]> {
  const pages: NotionListedPage[] = [];
  let cursor: string | undefined;
  do {
    const body: { page_size: number; start_cursor?: string } = {
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;
    const payload = await notion(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const record = asRecord(payload);
    const results = record?.results;
    if (!Array.isArray(results)) {
      throw new Error(
        "Notion 返回了看不懂的菜品列表。已停止同步，没有改菜单。",
      );
    }
    for (const result of results) {
      const page = readPage(result);
      if (!page || page.archived || page.inTrash) continue;
      pages.push(page);
    }
    const hasMore = record?.has_more === true;
    const next = record?.next_cursor;
    if (hasMore) {
      if (typeof next !== "string" || next.length === 0) {
        throw new Error("Notion 分页中断了。已停止同步，没有改菜单。");
      }
      cursor = next;
    } else {
      cursor = undefined;
    }
  } while (cursor);
  return pages;
}

async function loadTree(
  blockId: string,
  notion: NotionCaller,
  depth: number,
  budget: { count: number },
  stop: () => boolean,
): Promise<NotionBlock[] | "timeout"> {
  if (stop()) return "timeout";
  if (depth > MAX_DEPTH || budget.count >= MAX_BLOCKS) return [];
  const blocks = await listChildren(blockId, notion, stop);
  if (blocks === "timeout") return "timeout";
  for (const block of blocks) {
    if (stop()) return "timeout";
    budget.count += 1;
    if (budget.count > MAX_BLOCKS) break;
    if (
      block.has_children &&
      block.type !== "child_page" &&
      block.type !== "child_database" &&
      depth < MAX_DEPTH
    ) {
      const children = await loadTree(
        block.id,
        notion,
        depth + 1,
        budget,
        stop,
      );
      if (children === "timeout") return "timeout";
      block.children = children;
    }
  }
  return blocks;
}

async function listChildren(
  blockId: string,
  notion: NotionCaller,
  stop: () => boolean,
): Promise<NotionBlock[] | "timeout"> {
  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;
  do {
    if (stop()) return "timeout";
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) query.set("start_cursor", cursor);
    const page = readBlockChildrenPage(
      await notion(`/blocks/${blockId}/children?${query.toString()}`),
    );
    blocks.push(...page.blocks);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return blocks;
}

function chooseDataSource(
  sources: readonly { id: string }[],
  configured: string,
): string {
  const normalized = sources.map((source) => normalizeNotionId(source.id));
  if (normalized.includes(configured)) return configured;
  if (normalized.length === 1 && normalized[0]) return normalized[0];
  if (normalized.length === 0) {
    throw new Error("这个数据库没有数据源。已停止同步，没有改菜单。");
  }
  throw new Error(
    "这个数据库有多个数据源，请设置 NOTION_DATA_SOURCE_ID。已停止同步，没有改菜单。",
  );
}

function readDataSources(payload: unknown): { id: string }[] {
  const record = asRecord(payload);
  const sources = record?.data_sources;
  if (!Array.isArray(sources)) {
    throw new Error("Notion 没有返回数据源。已停止同步，没有改菜单。");
  }
  return sources.flatMap((source) => {
    const item = asRecord(source);
    return typeof item?.id === "string" ? [{ id: item.id }] : [];
  });
}

function readSelectOptionNames(
  payload: unknown,
  propertyName: string,
): string[] {
  const properties = asRecord(asRecord(payload)?.properties);
  const prop = asRecord(properties?.[propertyName]);
  if (!prop || prop.type !== "select") return [];
  const options = asRecord(prop.select)?.options;
  if (!Array.isArray(options)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    const raw = asRecord(option)?.name;
    const name = typeof raw === "string" ? raw.trim() : "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function readSchemaProperties(
  payload: unknown,
): Record<string, { type?: string }> {
  const record = asRecord(payload);
  const properties = asRecord(record?.properties);
  if (!properties) {
    throw new Error("Notion 数据源没有返回字段。已停止同步，没有改菜单。");
  }
  const result: Record<string, { type?: string }> = {};
  for (const [name, value] of Object.entries(properties)) {
    const prop = asRecord(value);
    result[name] = {
      type: typeof prop?.type === "string" ? prop.type : undefined,
    };
  }
  return result;
}

function readPage(value: unknown): NotionListedPage | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string") return null;
  const properties = asRecord(record.properties);
  const base = {
    id: record.id,
    archived: record.archived === true,
    inTrash: record.in_trash === true,
    cover: readFile(record.cover),
  };
  if (!properties) {
    return { ...base, properties: {}, fetchError: "属性读取失败" };
  }
  return {
    ...base,
    properties: properties as Record<string, NotionProperty>,
  };
}

function readFile(value: unknown): NotionFile | null {
  const record = asRecord(value);
  if (!record) return null;
  return record as NotionFile;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

async function notionRequest(
  token: string,
  path: string,
  fetchImpl: typeof fetch,
  wait: () => Promise<void>,
  init?: RequestInit,
): Promise<unknown> {
  const pathOnly = path.split("?")[0] ?? path;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await wait();
    let response: Response;
    try {
      response = await fetchImpl(`https://api.notion.com/v1${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
      });
    } catch {
      throw new Error(`Notion 请求失败。${pathOnly}`);
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const seconds =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1;
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      continue;
    }
    if (!response.ok) throw notionStatusError(response.status);
    return response.json() as Promise<unknown>;
  }
  throw new Error("Notion 请求太频繁，请稍后再同步。");
}

function notionStatusError(status: number): Error {
  if (status === 401)
    return new Error("Notion 令牌被拒绝。请检查 NOTION_TOKEN。");
  if (status === 403) {
    return new Error("Notion 集成没有读取权限。请把集成邀请到 Recipe 数据库。");
  }
  if (status === 404) return new Error("找不到 Notion 数据库或数据源。");
  return new Error(`Notion 请求失败（${status}）。`);
}

function createSlotter(intervalMs: number): () => Promise<void> {
  let nextAt = 0;
  return async () => {
    if (intervalMs <= 0) return;
    const now = Date.now();
    const at = Math.max(now, nextAt);
    nextAt = at + intervalMs;
    const delay = at - now;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  };
}
