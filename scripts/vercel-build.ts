import { loadLocalEnv, migrationDatabaseUrl } from "./db-env";
import { runCommand } from "./run";

loadLocalEnv();

if (!migrationDatabaseUrl()) {
  console.log(
    "[db] Skipping migrations: DATABASE_URL_UNPOOLED and DATABASE_URL are not set.",
  );
} else {
  runCommand("pnpm", ["db:migrate"], { redact: true });

  if (process.env.VERCEL_ENV === "preview") {
    console.log("[db] Seeding preview database.");
    runCommand("pnpm", ["db:seed"], { redact: true });
  } else {
    console.log('[db] Skipping seed: VERCEL_ENV is not "preview".');
  }
}

runCommand("pnpm", ["exec", "next", "build"]);
