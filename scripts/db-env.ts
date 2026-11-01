import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseEnvAssignments(contents: string): Record<string, string> {
  const assignments: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const stripped = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;
    const eq = stripped.indexOf("=");
    if (eq <= 0) continue;

    const key = stripped.slice(0, eq).trim();
    if (!ENV_KEY.test(key)) continue;

    let value = stripped.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    assignments[key] = value;
  }

  return assignments;
}

/**
 * Load env files the way Next.js does: already-set variables win, then
 * `.env.${mode}.local`, `.env.local` (except when mode is `test`),
 * `.env.${mode}`, and `.env`. `mode` defaults to `NODE_ENV` or `development`.
 * Values are never printed.
 */
export function loadLocalEnv(
  cwd = process.cwd(),
  options?: { mode?: string },
): void {
  const mode = options?.mode ?? process.env.NODE_ENV ?? "development";
  const files = [
    `.env.${mode}.local`,
    mode !== "test" ? ".env.local" : undefined,
    `.env.${mode}`,
    ".env",
  ].filter((file): file is string => Boolean(file));

  for (const file of files) {
    const fullPath = path.join(cwd, file);
    if (!existsSync(fullPath)) continue;

    const assignments = parseEnvAssignments(readFileSync(fullPath, "utf8"));
    for (const [key, value] of Object.entries(assignments)) {
      if (process.env[key] !== undefined) continue;
      process.env[key] = value;
    }
  }
}

export function migrationDatabaseUrl(): string | undefined {
  const unpooled = process.env.DATABASE_URL_UNPOOLED?.trim();
  const pooled = process.env.DATABASE_URL?.trim();
  return unpooled || pooled || undefined;
}

export function appDatabaseUrl(): string | undefined {
  const pooled = process.env.DATABASE_URL?.trim();
  const unpooled = process.env.DATABASE_URL_UNPOOLED?.trim();
  return pooled || unpooled || undefined;
}
