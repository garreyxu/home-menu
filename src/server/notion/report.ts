export type NotionSkip = {
  pageId: string;
  name: string | null;
  reason: string;
};

export type ImportReport = {
  imported: number;
  tried: number;
  noSteps: number;
  added: number;
  updated: number;
  deleted: number;
  inactivated: number;
  onWall: number;
  skipped: NotionSkip[];
  warnings: string[];
};

export function formatImportReport(report: ImportReport): string {
  const lines = [
    `导入 ${report.imported} 道，做过 ${report.tried}，没有步骤 ${report.noSteps}。`,
    `新增 ${report.added}，更新 ${report.updated}，删除 ${report.deleted}，下架 ${report.inactivated}，上墙 ${report.onWall}。`,
  ];
  for (const skip of report.skipped) {
    lines.push(`跳过 ${skip.name?.trim() || skip.pageId}：${skip.reason}`);
  }
  for (const warning of report.warnings) lines.push(warning);
  return lines.join("\n");
}

/** Drop tokens, connection strings, and signed URLs before anything is shown or logged. */
export function safeSyncError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "同步失败";
  const cleaned = raw
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")
    .replace(/https?:\/\/\S+/gi, "[链接]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:ntn|secret)_[A-Za-z0-9]+\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "同步失败";
  if (cleaned.includes("DATABASE_URL")) {
    return "还没连接数据库，所以还不能从 Notion 同步。";
  }
  return cleaned.slice(0, 300);
}
