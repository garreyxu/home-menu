import { isSundayWeekStart, shiftWeek } from "@/server/week";

export const FIRST_E2E_WEEK = "2090-01-01";
export const LAST_E2E_WEEK = "2099-12-27";
export const E2E_WEEK_COUNT = 522;
export class E2EInputError extends Error {}

export function e2eEnabled(env: {
  VERCEL_ENV?: string;
  NODE_ENV?: string;
}): boolean {
  return (
    env.VERCEL_ENV === "preview" ||
    (env.VERCEL_ENV === undefined &&
      (env.NODE_ENV === "development" || env.NODE_ENV === "test"))
  );
}
export function assertRunId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-z0-9-]{4,40}$/.test(value))
    throw new E2EInputError("Invalid runId");
}
export function assertE2EWeek(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value < FIRST_E2E_WEEK ||
    value > LAST_E2E_WEEK ||
    !isSundayWeekStart(value)
  )
    throw new E2EInputError("Week outside test scope");
}
export function assertE2EDish(runId: string, id: string) {
  assertRunId(runId);
  if (
    !id.startsWith(`e2e:${runId}:`) ||
    !/^[1-9]\d*$/.test(id.slice(`e2e:${runId}:`.length))
  )
    throw new E2EInputError("Dish outside test scope");
}
export function assertE2ECategory(runId: string, name: string) {
  assertRunId(runId);
  if (name !== `e2e-${runId}`)
    throw new E2EInputError("Category outside test scope");
}
export function candidateWeeks(
  runId: string,
  label: string,
  attempt: number,
  count: number,
): string[] {
  assertRunId(runId);
  if (
    !label ||
    label.length > 200 ||
    !Number.isInteger(attempt) ||
    attempt < 0 ||
    attempt > 4 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 4
  )
    throw new E2EInputError("Invalid allocation");
  let hash = 2166136261;
  for (const char of `${runId}:${label}`)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  // Leave room on either side for navigation, still entirely inside the window.
  const start = 1 + ((hash + attempt * count) % (E2E_WEEK_COUNT - count - 2));
  return Array.from({ length: count }, (_, n) =>
    shiftWeek(FIRST_E2E_WEEK, start + n),
  );
}
