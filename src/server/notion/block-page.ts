import type { NotionBlock } from "@/server/notion/types";

export function readBlockChildrenPage(payload: unknown): {
  blocks: NotionBlock[];
  nextCursor: string | null;
} {
  const record = asRecord(payload);
  const results = record?.results;
  if (!Array.isArray(results)) {
    throw new Error("正文读取失败");
  }
  const blocks: NotionBlock[] = [];
  for (const result of results) {
    const block = readBlock(result);
    if (block) blocks.push(block);
  }
  const hasMore = record?.has_more === true;
  const next = record?.next_cursor;
  if (!hasMore) return { blocks, nextCursor: null };
  if (typeof next !== "string" || next.length === 0) {
    throw new Error("正文读取失败");
  }
  return { blocks, nextCursor: next };
}

function readBlock(value: unknown): NotionBlock | null {
  const record = asRecord(value);
  if (
    !record ||
    typeof record.id !== "string" ||
    typeof record.type !== "string"
  ) {
    return null;
  }
  return record as unknown as NotionBlock;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
