import { afterEach, describe, expect, it } from "vitest";
import { AuthConfigError } from "@/lib/auth/config-error";
import {
  MIN_SESSION_SECRET_LENGTH,
  SESSION_MAX_AGE_SECONDS,
  clearedSessionCookieOptions,
  readSessionSecret,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "@/lib/auth/session";

const SECRET = "unit-test-session-secret-not-for-production";

const originalSecret = process.env.SESSION_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

describe("session tokens", () => {
  it("signs and verifies a token", async () => {
    const token = await signSession({ secret: SECRET });
    await expect(verifySession(token, SECRET)).resolves.toEqual({
      subject: "family",
    });
  });

  it("rejects a tampered signature and a tampered payload", async () => {
    const token = await signSession({ secret: SECRET });
    const [header, payload, signature] = token.split(".");
    expect(header && payload && signature).toBeTruthy();
    // Flip an early base64url digit. The last digit can encode unused bits,
    // so changing only that character sometimes leaves the signature valid.
    const flip = (segment: string) =>
      `${segment.slice(0, 1)}${segment[1] === "A" ? "B" : "A"}${segment.slice(2)}`;

    await expect(
      verifySession(`${header}.${payload}.${flip(signature!)}`, SECRET),
    ).resolves.toBeNull();
    await expect(
      verifySession(`${header}.${flip(payload!)}.${signature}`, SECRET),
    ).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 120;
    const token = await signSession({
      secret: SECRET,
      issuedAt,
      expiresInSeconds: 30,
    });
    await expect(verifySession(token, SECRET)).resolves.toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession({ secret: SECRET });
    const other = `${SECRET}-other`;
    await expect(verifySession(token, other)).resolves.toBeNull();
  });

  it("fails closed when the secret is missing or shorter than 32 characters", async () => {
    expect(SECRET.length).toBeGreaterThanOrEqual(MIN_SESSION_SECRET_LENGTH);
    await expect(signSession({ secret: "short" })).rejects.toBeInstanceOf(
      AuthConfigError,
    );
    await expect(verifySession("not-a-token", "short")).rejects.toBeInstanceOf(
      AuthConfigError,
    );

    delete process.env.SESSION_SECRET;
    expect(() => readSessionSecret()).toThrow(AuthConfigError);
    try {
      readSessionSecret();
    } catch (error) {
      expect(error).toBeInstanceOf(AuthConfigError);
      expect((error as Error).message).toMatch(/32 characters/);
      expect((error as Error).message).not.toMatch(/SESSION_SECRET=/);
    }

    process.env.SESSION_SECRET = "x".repeat(31);
    expect(() => readSessionSecret()).toThrow(AuthConfigError);
  });
});

describe("session cookie", () => {
  it("is httpOnly, SameSite=Lax, and expires in 30 days", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    const options = sessionCookieOptions(now, "development");
    expect(options).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    expect(options.expires.toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(sessionCookieOptions(now, "production").secure).toBe(true);
  });

  it("clears the cookie with the same flags", () => {
    expect(clearedSessionCookieOptions("production")).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  });
});
