import { requireApiSession } from "@/lib/auth/require-session";
import {
  assertE2EWeek,
  assertRunId,
  candidateWeeks,
  e2eEnabled,
  E2EInputError,
} from "@/lib/e2e-guard";
import { cleanupE2E, leftoversE2E, seedE2E } from "@/server/e2e-data";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "cache-control": "no-store" } });
  if (!e2eEnabled(process.env)) return json({ error: "Not found" }, 404);
  const denied = await requireApiSession();
  if (denied) return denied;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new E2EInputError("Invalid body");
    const { action, runId } = body;
    assertRunId(runId);
    if (request.headers.get("x-e2e-run") !== runId)
      throw new E2EInputError("Run header mismatch");
    // No arbitrary data selectors: reject misspelled or injected scope fields.
    const allowed = [
      "action",
      "runId",
      ...(action === "seed"
        ? ["label", "attempt", "count", "dishCount"]
        : action === "cleanup"
          ? ["weeks"]
          : []),
    ];
    if (Object.keys(body).some((key) => !allowed.includes(key)))
      throw new E2EInputError("Unknown field");
    if (action === "seed") {
      if (typeof body.label !== "string")
        throw new E2EInputError("Missing label");
      const weeks = candidateWeeks(
        runId,
        body.label,
        body.attempt ?? 0,
        body.count ?? 2,
      );
      const world = await seedE2E(
        runId,
        weeks,
        body.dishCount ?? 6,
        body.label,
      );
      return world ? json(world) : json({ error: "Week claimed" }, 409);
    }
    if (action === "cleanup") {
      if (body.weeks !== undefined) {
        if (!Array.isArray(body.weeks) || body.weeks.length > 4)
          throw new E2EInputError("Invalid weeks");
        body.weeks.forEach(assertE2EWeek);
      }
      await cleanupE2E(runId, body.weeks);
      return json({ ok: true });
    }
    if (action === "leftovers") return json(await leftoversE2E(runId));
    throw new E2EInputError("Unknown action");
  } catch (error) {
    if (error instanceof E2EInputError || error instanceof SyntaxError)
      return json({ error: "Invalid test data scope" }, 400);
    // Only fixed SQLSTATE codes and known schema constraints are safe to log.
    // Never log an Error object, message, query, parameters, or connection string.
    const seen = new Set<unknown>();
    let cause: unknown = error;
    let code = "unknown";
    let constraint = "unknown";
    const constraints = new Set([
      "menu_items_weekly_menu_id_weekly_menus_id_fk",
      "menu_items_dish_id_dishes_id_fk",
      "dishes_category_id_categories_id_fk",
    ]);
    while (cause && typeof cause === "object" && !seen.has(cause)) {
      seen.add(cause);
      const value = cause as Record<string, unknown>;
      if (typeof value.code === "string" && /^[0-9A-Z]{5}$/.test(value.code))
        code = value.code;
      if (
        typeof value.constraint === "string" &&
        constraints.has(value.constraint)
      )
        constraint = value.constraint;
      cause = value.cause;
    }
    console.error(
      `[e2e] Data operation failed: code=${code} constraint=${constraint}`,
    );
    return json({ error: "Test data operation failed" }, 500);
  }
}
