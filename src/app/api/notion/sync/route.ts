import { after } from "next/server";

import { requireApiSession } from "@/lib/auth/require-session";
import { getDb } from "@/server/db";
import { safeSyncError } from "@/server/notion/report";
import {
  beginSyncRun,
  failSyncRun,
  readSyncState,
  runSync,
  type SyncState,
} from "@/server/notion/sync-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function json(body: SyncState, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function GET(): Promise<Response> {
  const denied = await requireApiSession();
  if (denied) return denied;
  try {
    return json(await readSyncState(getDb()));
  } catch (error) {
    return json(idleError(error));
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireApiSession();
  if (denied) return denied;
  if (!sameOrigin(request)) {
    return json(
      {
        running: false,
        processed: 0,
        total: null,
        report: null,
        error: "同步没能开始。",
        settled: false,
      },
      403,
    );
  }

  try {
    const db = getDb();
    const begun = await beginSyncRun(db);
    if (!begun.alreadyRunning) {
      const runId = begun.id;
      after(async () => {
        try {
          await runSync(db, runId);
        } catch (error) {
          await failSyncRun(db, runId, safeSyncError(error));
        }
      });
    }
    return json(await readSyncState(db));
  } catch (error) {
    return json(idleError(error), 500);
  }
}

function idleError(error: unknown): SyncState {
  return {
    running: false,
    processed: 0,
    total: null,
    report: null,
    error: safeSyncError(error),
    settled: false,
  };
}
