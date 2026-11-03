import { and, desc, eq, lt } from "drizzle-orm";

import type { Database } from "@/server/db";
import { notionSyncRuns } from "@/server/db/schema";
import { fetchNotionSnapshots } from "@/server/notion/client";
import { readNotionConfig } from "@/server/notion/config";
import { importNotionCatalog } from "@/server/notion/import-catalog";
import { createDishRepository } from "@/server/notion/repository";
import {
  safeSyncError,
  type ImportReport,
  type NotionSkip,
} from "@/server/notion/report";
import { downloadImage } from "@/server/notion/photo";
import {
  createBlobPhotoStore,
  privateBlobConfigured,
} from "@/server/photos/blob-store";

const STALE_MS = 6 * 60 * 1000;

export type SyncState = {
  running: boolean;
  processed: number;
  total: number | null;
  report: ImportReport | null;
  error: string | null;
  settled: boolean;
};

export async function beginSyncRun(
  db: Database,
): Promise<{ id: string; alreadyRunning: boolean }> {
  await expireStaleRuns(db);
  try {
    const [created] = await db
      .insert(notionSyncRuns)
      .values({ status: "running" })
      .returning({ id: notionSyncRuns.id });
    if (!created) throw new Error("同步没能开始。");
    return { id: created.id, alreadyRunning: false };
  } catch (error) {
    if (!isRunningLockError(error)) throw error;
    const [running] = await db
      .select({ id: notionSyncRuns.id })
      .from(notionSyncRuns)
      .where(eq(notionSyncRuns.status, "running"))
      .limit(1);
    if (!running) throw error;
    return { id: running.id, alreadyRunning: true };
  }
}

export async function readSyncState(db: Database): Promise<SyncState> {
  await expireStaleRuns(db);
  const [row] = await db
    .select()
    .from(notionSyncRuns)
    .orderBy(desc(notionSyncRuns.startedAt))
    .limit(1);
  if (!row) {
    return {
      running: false,
      processed: 0,
      total: null,
      report: null,
      error: null,
      settled: false,
    };
  }
  return {
    running: row.status === "running",
    processed: row.processed,
    total: row.total,
    report: row.status === "succeeded" ? reportFromRow(row) : null,
    error: row.status === "failed" ? (row.error ?? "同步失败") : null,
    settled: true,
  };
}

export async function runSync(
  db: Database,
  runId: string,
): Promise<ImportReport> {
  try {
    const config = readNotionConfig();
    const report = await importNotionCatalog({
      loadPages: () =>
        fetchNotionSnapshots({
          token: config.token,
          databaseId: config.databaseId,
          dataSourceId: config.dataSourceId,
          onProgress: async (processed, total) => {
            await db
              .update(notionSyncRuns)
              .set({
                processed,
                total,
                heartbeatAt: new Date(),
              })
              .where(
                and(
                  eq(notionSyncRuns.id, runId),
                  eq(notionSyncRuns.status, "running"),
                ),
              );
          },
        }),
      download: downloadImage,
      photos: createBlobPhotoStore(),
      dishes: createDishRepository(db),
      storageConfigured: privateBlobConfigured(),
    });
    await db
      .update(notionSyncRuns)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        heartbeatAt: new Date(),
        added: report.added,
        updated: report.updated,
        delisted: report.delisted,
        imported: report.imported,
        withPhoto: report.withPhoto,
        placeholder: report.placeholder,
        onWall: report.onWall,
        onWallWithPhoto: report.onWallWithPhoto,
        notTried: report.notTried,
        processed: report.imported,
        total: report.imported,
        skipped: report.skipped,
        warnings: report.warnings,
        error: null,
      })
      .where(
        and(eq(notionSyncRuns.id, runId), eq(notionSyncRuns.status, "running")),
      );
    return report;
  } catch (error) {
    const message = safeSyncError(error);
    await failSyncRun(db, runId, message);
    throw new Error(message);
  }
}

export async function failSyncRun(
  db: Database,
  runId: string,
  message: string,
): Promise<void> {
  await db
    .update(notionSyncRuns)
    .set({
      status: "failed",
      error: message,
      finishedAt: new Date(),
      heartbeatAt: new Date(),
    })
    .where(
      and(eq(notionSyncRuns.id, runId), eq(notionSyncRuns.status, "running")),
    );
}

async function expireStaleRuns(db: Database): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_MS);
  await db
    .update(notionSyncRuns)
    .set({
      status: "failed",
      error: "同步中断了，可以再点一次。",
      finishedAt: new Date(),
    })
    .where(
      and(
        eq(notionSyncRuns.status, "running"),
        lt(notionSyncRuns.heartbeatAt, cutoff),
      ),
    );
}

function reportFromRow(row: {
  added: number;
  updated: number;
  delisted: number;
  imported: number;
  withPhoto: number;
  placeholder: number;
  onWall: number;
  onWallWithPhoto: number;
  notTried: number;
  skipped: unknown;
  warnings: unknown;
}): ImportReport {
  return {
    imported: row.imported,
    withPhoto: row.withPhoto,
    placeholder: row.placeholder,
    added: row.added,
    updated: row.updated,
    delisted: row.delisted,
    onWall: row.onWall,
    onWallWithPhoto: row.onWallWithPhoto,
    notTried: row.notTried,
    skipped: asSkips(row.skipped),
    warnings: asStrings(row.warnings),
  };
}

function asSkips(value: unknown): NotionSkip[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (
      typeof record.pageId !== "string" ||
      typeof record.reason !== "string"
    ) {
      return [];
    }
    return [
      {
        pageId: record.pageId,
        name: typeof record.name === "string" ? record.name : null,
        reason: record.reason,
      },
    ];
  });
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function isRunningLockError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (record.code === "23505") return true;
    if (
      typeof record.message === "string" &&
      record.message.includes("notion_sync_runs_one_running")
    ) {
      return true;
    }
    current = record.cause;
  }
  return false;
}
