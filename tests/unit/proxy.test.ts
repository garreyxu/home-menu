import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "@/proxy";
import { SESSION_COOKIE_NAME, signSession } from "@/lib/auth/session";

const SECRET = "unit-test-session-secret-not-for-production";
const originalSecret = process.env.SESSION_SECRET;
const originalCronSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
});

async function callProxy(
  path: string,
  cookie?: string,
  authorization?: string,
) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  if (authorization) headers.set("authorization", authorization);
  return proxy(new NextRequest(`http://127.0.0.1:3000${path}`, { headers }));
}

function proxyMatches(url: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url });
}

describe("proxy matcher", () => {
  it("always matches /api, including static-looking extensions", () => {
    expect(proxyMatches("/api/dishes/x.webp")).toBe(true);
    expect(proxyMatches("/api/anything.js")).toBe(true);
    expect(proxyMatches("/foo.png")).toBe(true);
    expect(proxyMatches("/icon")).toBe(true);
    expect(proxyMatches("/apple-icon")).toBe(true);
    expect(proxyMatches("/")).toBe(true);
  });

  it("skips Next static files, icons, frames, and illustrations", () => {
    expect(proxyMatches("/_next/static/chunks/app.js")).toBe(false);
    expect(proxyMatches("/_next/image")).toBe(false);
    expect(proxyMatches("/favicon.ico")).toBe(false);
    expect(proxyMatches("/icon.png")).toBe(false);
    expect(proxyMatches("/apple-icon.png")).toBe(false);
    expect(proxyMatches("/icon-512.png")).toBe(false);
    expect(proxyMatches("/assets/pixel.png")).toBe(false);
    expect(proxyMatches("/frames/card-a.svg")).toBe(false);
    expect(proxyMatches("/illustrations/dish-480.webp")).toBe(false);
  });
});

describe("proxy", () => {
  it("returns a generic 500 when SESSION_SECRET is too short", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.SESSION_SECRET = "too-short";
    try {
      const response = await callProxy("/");
      expect(response.status).toBe(500);
      const body = await response.text();
      expect(body).toMatch(/SESSION_SECRET/);
      expect(body).not.toContain("too-short");
      expect(body).not.toMatch(/length \d+/);
      expect(body).not.toContain("too short");
      const logged = errorSpy.mock.calls
        .map((args) => args.join(" "))
        .join("\n");
      expect(logged).toContain("length 9");
      expect(logged).not.toContain("too-short");
    } finally {
      errorSpy.mockRestore();
    }
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

    const imageApi = await callProxy("/api/dishes/x.webp");
    expect(imageApi.status).toBe(401);

    const cron = await callProxy("/api/cron/notion-sync");
    expect(cron.status).toBe(401);
    process.env.CRON_SECRET = "cron-secret-value";
    const allowedCron = await callProxy(
      "/api/cron/notion-sync",
      undefined,
      "Bearer cron-secret-value",
    );
    expect(allowedCron.status).not.toBe(401);
    expect(allowedCron.headers.get("location")).toBeNull();
    delete process.env.CRON_SECRET;

    const image = await callProxy("/foo.png");
    expect(image.status).toBe(307);
    expect(
      new URL(image.headers.get("location")!).searchParams.get("next"),
    ).toBe("/foo.png");
  });

  it("allows a request with a valid session cookie", async () => {
    process.env.SESSION_SECRET = SECRET;
    const token = await signSession({ secret: SECRET });
    const response = await callProxy("/", token);
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
