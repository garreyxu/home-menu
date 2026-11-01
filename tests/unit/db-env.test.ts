import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  appDatabaseUrl,
  loadLocalEnv,
  migrationDatabaseUrl,
  parseEnvAssignments,
} from "../../scripts/db-env";
import { redactSecrets } from "../../scripts/redact";

const ENV_KEYS = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "ALREADY",
  "FROM_FILE",
] as const;
const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("parseEnvAssignments", () => {
  it("reads assignments and ignores comments", () => {
    expect(
      parseEnvAssignments(`
# comment
DATABASE_URL="postgres://file.example/db"
export DATABASE_URL_UNPOOLED='postgres://direct.example/db'
EMPTY=
`),
    ).toEqual({
      DATABASE_URL: "postgres://file.example/db",
      DATABASE_URL_UNPOOLED: "postgres://direct.example/db",
      EMPTY: "",
    });
  });
});

describe("database url selection", () => {
  it("uses the unpooled url for migrations and the pooled url for the app", () => {
    process.env.DATABASE_URL_UNPOOLED = "postgres://unpooled.example/db";
    process.env.DATABASE_URL = "postgres://pooled.example/db";

    expect(migrationDatabaseUrl()).toBe("postgres://unpooled.example/db");
    expect(appDatabaseUrl()).toBe("postgres://pooled.example/db");
  });

  it("returns undefined when both urls are blank", () => {
    process.env.DATABASE_URL = " ";
    process.env.DATABASE_URL_UNPOOLED = "";
    expect(migrationDatabaseUrl()).toBeUndefined();
    expect(appDatabaseUrl()).toBeUndefined();
  });

  it("falls back when a url is blank", () => {
    process.env.DATABASE_URL_UNPOOLED = "  ";
    process.env.DATABASE_URL = "postgres://pooled.example/db";

    expect(migrationDatabaseUrl()).toBe("postgres://pooled.example/db");

    delete process.env.DATABASE_URL;
    process.env.DATABASE_URL_UNPOOLED = "postgres://unpooled.example/db";
    expect(appDatabaseUrl()).toBe("postgres://unpooled.example/db");
  });
});

describe("loadLocalEnv", () => {
  it("loads .env.local without overriding variables that are already set", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "home-menu-env-"));
    writeFileSync(
      path.join(dir, ".env"),
      "FROM_FILE=from-env\nDATABASE_URL=postgres://dotenv.example/db\n",
    );
    writeFileSync(
      path.join(dir, ".env.local"),
      "FROM_FILE=from-local\nDATABASE_URL=postgres://local.example/db\n",
    );

    delete process.env.DATABASE_URL;
    delete process.env.FROM_FILE;
    process.env.ALREADY = "set";

    loadLocalEnv(dir, { mode: "development" });
    expect(process.env.FROM_FILE).toBe("from-local");
    expect(process.env.DATABASE_URL).toBe("postgres://local.example/db");
    expect(process.env.ALREADY).toBe("set");
  });
});

describe("redactSecrets", () => {
  it("removes connection strings", () => {
    const redacted = redactSecrets(
      "connect failed postgres://user:secret@ep-example.neon.tech/neondb?sslmode=require DATABASE_URL=postgres://other.example/db",
    );
    expect(redacted).not.toContain("secret");
    expect(redacted).not.toContain("ep-example");
    expect(redacted).not.toContain("other.example");
    expect(redacted).toContain("postgres://[redacted]");
    expect(redacted).toContain("DATABASE_URL=[redacted]");
  });
});
