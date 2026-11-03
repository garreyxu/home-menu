import { normalizeNotionId } from "@/server/notion/ids";

export const DEFAULT_NOTION_DATABASE_ID = "ff95d9e83ae144ffaaa461286c9652ad";
export const DEFAULT_NOTION_DATA_SOURCE_ID =
  "b8a7d4f9-5bfd-4ed3-bacd-5a5298796038";

export class NotionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotionConfigError";
  }
}

export function readNotionConfig(): {
  token: string;
  databaseId: string;
  dataSourceId: string;
} {
  const token = process.env.NOTION_TOKEN?.trim() ?? "";
  if (!token) {
    throw new NotionConfigError(
      "还没配置 NOTION_TOKEN。把它放在 Vercel 的 Production 和 Preview 环境里，不要写进仓库。",
    );
  }
  return {
    token,
    databaseId: normalizeNotionId(
      process.env.NOTION_DATABASE_ID?.trim() || DEFAULT_NOTION_DATABASE_ID,
    ),
    dataSourceId: normalizeNotionId(
      process.env.NOTION_DATA_SOURCE_ID?.trim() ||
        DEFAULT_NOTION_DATA_SOURCE_ID,
    ),
  };
}
