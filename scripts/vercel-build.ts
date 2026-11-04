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
    console.log(
      "[db] Skipping seed: production is never seeded. Sample rows are not in migrations.",
    );
  }
}

runCommand("pnpm", ["exec", "next", "build"]);
