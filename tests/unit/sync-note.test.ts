import { describe, expect, it } from "vitest";

import { describeSync, formatSyncStamp } from "@/lib/sync-note";
import type { ImportReport } from "@/server/notion/report";

function report(partial: boolean): ImportReport {
  return {
    imported: 43,
    partial,
    deferred: partial ? 10 : 0,
    tried: 0,
    noSteps: 0,
    errored: 0,
    seedsRetired: 0,
    added: 0,
    updated: 43,
    deleted: 0,
    inactivated: 0,
    wouldRemove: 0,
    removalsSkipped: false,
    onWall: 43,
    skipped: [],
    noStepPages: [],
    erroredPages: [],
    warnings: partial ? ["还有 10 道菜的做法没读完，下次同步会继续。"] : [],
  };
}

describe("formatSyncStamp", () => {
  it("prints Pacific time so two runs are not the same sentence", () => {
    expect(formatSyncStamp("2026-11-09T22:00:00.000Z")).toBe(
      "2026-11-09 14:00 PT",
    );
    expect(formatSyncStamp("2026-07-09T21:05:00.000Z")).toBe(
      "2026-07-09 14:05 PT",
    );
    expect(formatSyncStamp(null)).toBeNull();
  });
});

describe("describeSync", () => {
  it("does not keep the previous success line while a run is still going", () => {
    const note = describeSync({
      running: true,
      processed: 0,
      total: null,
      startedAt: "2026-11-09T22:00:00.000Z",
      report: report(false),
      error: null,
    });
    expect(note).toContain("正在同步");
    expect(note).toContain("开始 2026-11-09 14:00 PT");
    expect(note).not.toContain("更新 43");
  });

  it("includes the start and finish in PT and a partial continuation", () => {
    const note = describeSync({
      running: false,
      partial: true,
      startedAt: "2026-11-09T22:00:00.000Z",
      finishedAt: "2026-11-09T22:01:10.000Z",
      report: report(true),
      error: null,
    });
    expect(note).toContain("开始 2026-11-09 14:00 PT");
    expect(note).toContain("结束 2026-11-09 14:01 PT");
    expect(note).toContain("新增 0，更新 43");
    expect(note).toContain("下次同步会继续");
  });
});
