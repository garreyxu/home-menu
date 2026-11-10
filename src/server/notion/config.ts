import { normalizeNotionId } from "@/server/notion/ids";

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
  const databaseId = process.env.NOTION_DATABASE_ID?.trim();
  const dataSourceId = process.env.NOTION_DATA_SOURCE_ID?.trim();
  if (!databaseId || !dataSourceId) {
    throw new NotionConfigError(
      "同步需要 NOTION_DATABASE_ID 和 NOTION_DATA_SOURCE_ID。请配置缺少的环境变量。",
    );
  }
  return {
    token,
    databaseId: normalizeNotionId(databaseId),
    dataSourceId: normalizeNotionId(dataSourceId),
  };
}
