import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthConfigError } from "@/lib/auth/config-error";
import { requireApiSession, requireSession } from "@/lib/auth/require-session";
import { signSession } from "@/lib/auth/session";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

const SECRET = "unit-test-session-secret-not-for-production";
const originalSecret = process.env.SESSION_SECRET;

function mockCookie(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: () => (value === undefined ? undefined : { value }),
  } as Awaited<ReturnType<typeof cookies>>);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SESSION_SECRET = SECRET;
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

describe("requireSession", () => {
  it("redirects when the cookie is missing or invalid", async () => {
    mockCookie(undefined);
    await expect(requireSession()).rejects.toThrow("REDIRECT /login");

    mockCookie("not-a-session");
    await expect(requireSession()).rejects.toThrow("REDIRECT /login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("returns the session when the cookie verifies", async () => {
    mockCookie(await signSession({ secret: SECRET }));
    await expect(requireSession()).resolves.toEqual({ subject: "family" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("fails closed when a cookie is present but SESSION_SECRET is too short", async () => {
    process.env.SESSION_SECRET = "short";
    mockCookie("present-but-unusable");
    await expect(requireSession()).rejects.toBeInstanceOf(AuthConfigError);
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("requireApiSession", () => {
  it("returns a 401 response when the session is missing", async () => {
    mockCookie(undefined);
    const response = await requireApiSession();
    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns null when the session is valid", async () => {
    mockCookie(await signSession({ secret: SECRET }));
    await expect(requireApiSession()).resolves.toBeNull();
  });
});
