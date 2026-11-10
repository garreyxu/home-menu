import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  seed: vi.fn(),
  cleanup: vi.fn(),
  leftovers: vi.fn(),
}));
vi.mock("@/lib/auth/require-session", () => ({
  requireApiSession: mocks.session,
}));
vi.mock("@/server/e2e-data", () => ({
  seedE2E: mocks.seed,
  cleanupE2E: mocks.cleanup,
  leftoversE2E: mocks.leftovers,
}));
import { POST } from "@/app/api/e2e/route";
const request = (body: unknown, header = "run-1234") =>
  new Request("http://localhost/api/e2e", {
    method: "POST",
    headers: { "x-e2e-run": header },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "preview");
  mocks.session.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
describe("route environment, session, and data scope", () => {
  it.each(["seed", "cleanup", "leftovers"])(
    "returns 404 before authentication or storage for production %s",
    async (action) => {
      vi.stubEnv("VERCEL_ENV", "production");
      expect((await POST(request({ action, runId: "run-1234" }))).status).toBe(
        404,
      );
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.seed).not.toHaveBeenCalled();
      expect(mocks.cleanup).not.toHaveBeenCalled();
      expect(mocks.leftovers).not.toHaveBeenCalled();
    },
  );
  it("rechecks the session and returns JSON 401", async () => {
    mocks.session.mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const response = await POST(request({ action: "seed", runId: "run-1234" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.seed).not.toHaveBeenCalled();
  });
  it.each([
    { action: "cleanup", runId: "BAD" },
    { action: "cleanup", runId: "run-1234", weeks: ["2026-12-27"] },
    { action: "cleanup", runId: "run-1234", weeks: ["2090-01-02"] },
    { action: "cleanup", runId: "run-1234", weeks: "2090-01-01" },
    { action: "cleanup", runId: "run-1234", notionPageId: "real-id" },
    { action: "seed", runId: "run-1234", label: "test", category: "家常菜" },
    {
      action: "seed",
      runId: "run-1234",
      label: "test",
      weekStart: "2026-12-27",
    },
  ])("rejects invalid scope before storage: %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.seed).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it("rejects mismatched run headers", async () => {
    expect(
      (
        await POST(
          request({ action: "cleanup", runId: "run-1234" }, "other-run"),
        )
      ).status,
    ).toBe(400);
  });
  it("reports collisions for the fixture to retry", async () => {
    mocks.seed.mockResolvedValue(null);
    expect(
      (
        await POST(
          request({ action: "seed", runId: "run-1234", label: "test" }),
        )
      ).status,
    ).toBe(409);
    expect(mocks.seed.mock.calls[0][1]).toHaveLength(2);
  });
});

it("logs only allowlisted database diagnostics, never error text or connection data", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.cleanup.mockRejectedValueOnce(
      new Error("postgres://DO-NOT-LOG", {
        cause: {
          code: "23503",
          constraint: "menu_items_dish_id_dishes_id_fk",
          detail: "DO-NOT-LOG",
        },
      }),
    );
    const response = await POST(
      request({ action: "cleanup", runId: "run-1234" }),
    );
    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledExactlyOnceWith(
      "[e2e] Data operation failed: code=23503 constraint=menu_items_dish_id_dishes_id_fk",
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("DO-NOT-LOG");
    expect(await response.text()).not.toContain("DO-NOT-LOG");
  } finally {
    log.mockRestore();
  }
});
