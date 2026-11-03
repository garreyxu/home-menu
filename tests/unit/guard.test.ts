import { describe, expect, it } from "vitest";
import { decideAccess } from "@/lib/auth/guard";
import { signSession } from "@/lib/auth/session";

const SECRET = "unit-test-session-secret-not-for-production";
const ORIGIN = "http://127.0.0.1:3000";

async function access(
  overrides: Partial<Parameters<typeof decideAccess>[0]> = {},
) {
  return decideAccess({
    pathname: "/",
    search: "",
    nextParam: null,
    sessionToken: undefined,
    secret: SECRET,
    origin: ORIGIN,
    ...overrides,
  });
}

describe("decideAccess", () => {
  it("fails closed when the session secret is missing or short", async () => {
    for (const secret of [undefined, "", "short-secret-value"]) {
      const decision = await access({ secret });
      expect(decision.kind).toBe("misconfigured");
      if (decision.kind === "misconfigured") {
        expect(decision.message).toMatch(/SESSION_SECRET/);
        expect(decision.message).not.toContain("short-secret-value");
      }
    }
  });

  it("redirects anonymous page requests to login and keeps a relative next path", async () => {
    const decision = await access({ pathname: "/week", search: "?d=1" });
    expect(decision.kind).toBe("redirect");
    if (decision.kind === "redirect") {
      const url = new URL(decision.to);
      expect(url.origin).toBe(ORIGIN);
      expect(url.pathname).toBe("/login");
      expect(url.searchParams.get("next")).toBe("/week?d=1");
    }
  });

  it("returns 401-shaped unauthorized for anonymous API requests", async () => {
    await expect(access({ pathname: "/api/dishes" })).resolves.toEqual({
      kind: "unauthorized",
    });
  });

  it("allows login and logout without a session", async () => {
    await expect(access({ pathname: "/login" })).resolves.toEqual({
      kind: "allow",
    });
    await expect(access({ pathname: "/logout" })).resolves.toEqual({
      kind: "allow",
    });
  });

  it("allows a valid session and ignores a tampered cookie", async () => {
    const token = await signSession({ secret: SECRET });
    await expect(access({ sessionToken: token })).resolves.toEqual({
      kind: "allow",
    });
    await expect(access({ sessionToken: `${token}x` })).resolves.toMatchObject({
      kind: "redirect",
    });
  });

  it("sends a signed-in visitor away from an open redirect on /login", async () => {
    const token = await signSession({ secret: SECRET });
    const decision = await access({
      pathname: "/login",
      nextParam: "https://evil.example",
      sessionToken: token,
    });
    expect(decision).toEqual({ kind: "redirect", to: `${ORIGIN}/` });
  });
});
