import { bearerMatches } from "@/lib/notion-cron";
import { getDb } from "@/server/db";
import { removalSkippedNotice, safeSyncError } from "@/server/notion/report";
import {
  beginSyncRun,
  readSyncState,
  runSync,
} from "@/server/notion/sync-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Same 300s ceiling as the manual sync. The import stops itself at 240s. */
export const maxDuration = 300;

function unauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  if (
    !bearerMatches(
      request.headers.get("authorization"),
      process.env.CRON_SECRET,
    )
  ) {
    return unauthorized();
  }

  try {
    const db = getDb();
    const begun = await beginSyncRun(db);
    if (begun.alreadyRunning) {
      const state = await readSyncState(db);
      return Response.json(
        { ok: true, alreadyRunning: true, ...state },
        { headers: { "cache-control": "no-store" } },
      );
    }
    const report = await runSync(db, begun.id);
    if (report.removalsSkipped) {
      console.log(`[notion] ${removalSkippedNotice(report.wouldRemove)}`);
    }
    return Response.json(
      { ok: true, report },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: safeSyncError(error) },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
