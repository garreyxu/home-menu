import {
  removalSkippedNotice,
  type ImportReport,
} from "@/server/notion/report";

const PACIFIC = "America/Los_Angeles";

export type SyncNoteState = {
  running?: boolean;
  processed?: number;
  total?: number | null;
  report?: ImportReport | null;
  error?: string | null;
  partial?: boolean;
  startedAt?: string | null;
  finishedAt?: string | null;
};

/** Clock time in America/Los_Angeles, labeled PT, so two runs are not the same sentence. */
export function formatSyncStamp(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")} ${read("hour")}:${read("minute")} PT`;
}

export function describeSync(state: SyncNoteState | null): string | null {
  if (!state) return null;
  if (state.running) {
    const total = state.total ?? 0;
    const progress =
      total > 0
        ? `正在同步，已处理 ${state.processed ?? 0} / ${total}`
        : "正在同步…";
    const started = formatSyncStamp(state.startedAt);
    return started ? `${progress}（开始 ${started}）` : progress;
  }
  if (state.error) return state.error;
  if (!state.report) return null;
  const report = state.report;
  const parts = [
    `新增 ${report.added}，更新 ${report.updated}，删除 ${report.deleted}，下架 ${report.inactivated}，上墙 ${report.onWall}`,
    `导入 ${report.imported} 道，做过 ${report.tried}，没有步骤 ${report.noSteps}，读取失败 ${report.errored}，样本菜退下 ${report.seedsRetired}`,
  ];
  const started = formatSyncStamp(state.startedAt);
  const finished = formatSyncStamp(state.finishedAt);
  const clocks = [
    started ? `开始 ${started}` : null,
    finished ? `结束 ${finished}` : null,
  ].filter((part): part is string => part !== null);
  if (clocks.length > 0) parts.unshift(clocks.join("，"));
  if (report.removalsSkipped) {
    parts.unshift(removalSkippedNotice(report.wouldRemove));
  }
  if (report.skipped.length > 0) {
    parts.push(
      report.skipped
        .map((skip) => `跳过 ${skip.name ?? "未命名"}：${skip.reason}`)
        .join("；"),
    );
  }
  if (report.warnings.length > 0) parts.push(report.warnings.join(" "));
  return parts.join("。");
}
