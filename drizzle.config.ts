import { defineConfig } from "drizzle-kit";

import { loadLocalEnv, migrationDatabaseUrl } from "./scripts/db-env";

loadLocalEnv();

const url = migrationDatabaseUrl();

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  ...(url ? { dbCredentials: { url } } : {}),
});
