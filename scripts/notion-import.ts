import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../src/server/db/schema";
import { formatImportReport, safeSyncError } from "../src/server/notion/report";
import { beginSyncRun, runSync } from "../src/server/notion/sync-service";
import { appDatabaseUrl, loadLocalEnv } from "./db-env";
import { redactSecrets } from "./redact";

loadLocalEnv();

async function main(): Promise<void> {
  const url = appDatabaseUrl();
  if (!url) {
    console.error("[notion] 还没配置 DATABASE_URL。");
    process.exit(1);
  }

  const db = drizzle({ client: neon(url), schema });
  const begun = await beginSyncRun(db);
  if (begun.alreadyRunning) {
    console.error("[notion] 已经有一次同步在进行。");
    process.exit(1);
  }

  const allowMassRemoval = process.argv.includes("--allow-mass-removal");
  const report = await runSync(db, begun.id, { allowMassRemoval });
  console.log(formatImportReport(report));
}

main().catch((error: unknown) => {
  console.error(`[notion] ${redactSecrets(safeSyncError(error))}`);
  process.exit(1);
});
