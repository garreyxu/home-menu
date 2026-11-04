/**
 * Sample dishes are inserted only by `scripts/seed.ts`, never by a migration.
 * Production builds do not call that script. A database that already has
 * Notion dishes is also left alone, so a later preview build cannot put the
 * samples back.
 */
export function seedDecision(input: {
  vercelEnv: string | undefined;
  hasNotionDishes: boolean;
}): "refuse-production" | "skip-imported" | "insert" {
  if (input.vercelEnv === "production") return "refuse-production";
  if (input.hasNotionDishes) return "skip-imported";
  return "insert";
}
