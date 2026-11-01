import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { proxy } from "@/proxy";
import { SESSION_COOKIE_NAME, signSession } from "@/lib/auth/session";

const SECRET = "unit-test-session-secret-not-for-production";
const originalSecret = process.env.SESSION_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

async function callProxy(path: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  return proxy(new NextRequest(`http://127.0.0.1:3000${path}`, { headers }));
}

describe("proxy", () => {
  it("returns a clear 500 when SESSION_SECRET is too short", async () => {
    process.env.SESSION_SECRET = "too-short";
    const response = await callProxy("/");
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toMatch(/SESSION_SECRET/);
    expect(body).not.toContain("too-short");
  });

  it("redirects anonymous HTML requests and rejects API requests", async () => {
    process.env.SESSION_SECRET = SECRET;
    const page = await callProxy("/week?d=1");
    expect(page.status).toBe(307);
    const location = page.headers.get("location");
    expect(location).toBeTruthy();
    const url = new URL(location!);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/week?d=1");

    const api = await callProxy("/api/dishes");
    expect(api.status).toBe(401);
    await expect(api.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("allows a request with a valid session cookie", async () => {
    process.env.SESSION_SECRET = SECRET;
    const token = await signSession({ secret: SECRET });
    const response = await callProxy("/", token);
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(500);
  });
});
