import { loadLocalEnv, migrationDatabaseUrl } from "./db-env";
import { runCommand } from "./run";

loadLocalEnv();

if (!migrationDatabaseUrl()) {
  console.error(
    "[db] Cannot migrate: set DATABASE_URL_UNPOOLED or DATABASE_URL.",
  );
  process.exit(1);
}

console.log("[db] Applying migrations.");
runCommand("pnpm", ["exec", "drizzle-kit", "migrate"], { redact: true });
console.log("[db] Migrations applied.");
