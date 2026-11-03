import { hash } from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthConfigError } from "@/lib/auth/config-error";
import {
  assertAuthConfigured,
  verifyCredentials,
} from "@/lib/auth/credentials";
import {
  MIN_SESSION_SECRET_LENGTH,
  assertSessionSecret,
  readSessionSecret,
} from "@/lib/auth/session";

const USERNAME = "canary-username-do-not-log";
const PASSWORD = "canary-password-do-not-log";
const SECRET = "canary-session-secret-do-not-log-value";
const HASH_MARKER = "CANARYHASHVALUEDONOTLOG";

const originalUsername = process.env.AUTH_USERNAME;
const originalHash = process.env.AUTH_PASSWORD_HASH;
const originalSecret = process.env.SESSION_SECRET;

let errorSpy: ReturnType<typeof vi.spyOn>;

function logged(): string {
  return errorSpy.mock.calls
    .map((args: unknown[]) => args.map(String).join(" "))
    .join("\n");
}

function expectNoSecretMaterial(text: string, materials: string[]): void {
  for (const material of materials) {
    expect(material.length).toBeGreaterThan(0);
    expect(text).not.toContain(material);
    if (material.length >= 12) {
      expect(text).not.toContain(material.slice(0, 12));
      expect(text).not.toContain(material.slice(-12));
    }
  }
}

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.AUTH_USERNAME = USERNAME;
  process.env.SESSION_SECRET = SECRET;
  delete process.env.AUTH_PASSWORD_HASH;
});

afterEach(() => {
  errorSpy.mockRestore();
  if (originalUsername === undefined) delete process.env.AUTH_USERNAME;
  else process.env.AUTH_USERNAME = originalUsername;
  if (originalHash === undefined) delete process.env.AUTH_PASSWORD_HASH;
  else process.env.AUTH_PASSWORD_HASH = originalHash;
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
});

describe("AUTH_PASSWORD_HASH validation logs", () => {
  it("logs a missing hash and keeps the thrown error generic", async () => {
    try {
      await verifyCredentials(USERNAME, PASSWORD);
      expect.fail("expected configuration to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthConfigError);
      const message = (error as Error).message;
      expect(message).not.toMatch(/wrong (prefix|length)/);
      expect(message).not.toMatch(/got \d+/);
      expectNoSecretMaterial(message, [USERNAME, PASSWORD, SECRET]);
    }

    const text = logged();
    expect(text).toBe("[auth] AUTH_PASSWORD_HASH is missing.");
    expectNoSecretMaterial(text, [USERNAME, PASSWORD, SECRET]);
  });

  it("logs an empty hash as missing", () => {
    process.env.AUTH_PASSWORD_HASH = "";
    expect(() => assertAuthConfigured()).toThrow(AuthConfigError);
    expect(logged()).toBe("[auth] AUTH_PASSWORD_HASH is missing.");
    expectNoSecretMaterial(logged(), [USERNAME, PASSWORD, SECRET]);
  });

  it("logs the wrong length without the hash", async () => {
    const hashValue = `$2a$${HASH_MARKER}${PASSWORD}`;
    expect(hashValue.length).not.toBe(60);
    process.env.AUTH_PASSWORD_HASH = hashValue;

    try {
      await verifyCredentials(USERNAME, PASSWORD);
      expect.fail("expected configuration to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthConfigError);
      const message = (error as Error).message;
      expect(message).toMatch(/bcrypt/);
      expect(message).not.toMatch(/wrong length/);
      expect(message).not.toContain(String(hashValue.length));
      expectNoSecretMaterial(message, [
        hashValue,
        HASH_MARKER,
        USERNAME,
        PASSWORD,
        SECRET,
      ]);
    }

    const text = logged();
    expect(text).toBe(
      `[auth] AUTH_PASSWORD_HASH has the wrong length (expected 60, got ${hashValue.length}).`,
    );
    expectNoSecretMaterial(text, [
      hashValue,
      HASH_MARKER,
      USERNAME,
      PASSWORD,
      SECRET,
    ]);
  });

  it("logs the wrong prefix without the hash", () => {
    const hashValue = `$2c$${HASH_MARKER}${"A".repeat(60 - 4 - HASH_MARKER.length)}`;
    expect(hashValue).toHaveLength(60);
    process.env.AUTH_PASSWORD_HASH = hashValue;

    try {
      assertAuthConfigured();
      expect.fail("expected configuration to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthConfigError);
      const message = (error as Error).message;
      expect(message).not.toMatch(/prefix/);
      expect(message).not.toContain("$2c");
      expectNoSecretMaterial(message, [
        hashValue,
        HASH_MARKER,
        USERNAME,
        PASSWORD,
        SECRET,
      ]);
    }

    const text = logged();
    expect(text).toBe(
      "[auth] AUTH_PASSWORD_HASH has the wrong prefix (expected $2a/$2b/$2y).",
    );
    expect(text).not.toContain("$2c");
    expectNoSecretMaterial(text, [
      hashValue,
      HASH_MARKER,
      USERNAME,
      PASSWORD,
      SECRET,
    ]);
  });

  it("logs an invalid bcrypt body without the hash", () => {
    const payload = `${HASH_MARKER}${"A".repeat(53 - HASH_MARKER.length)}`;
    const hashValue = `$2a$zz$${payload}`;
    expect(hashValue).toHaveLength(60);
    process.env.AUTH_PASSWORD_HASH = hashValue;

    expect(() => assertAuthConfigured()).toThrow(AuthConfigError);
    const text = logged();
    expect(text).toBe("[auth] AUTH_PASSWORD_HASH is not a valid bcrypt hash.");
    expectNoSecretMaterial(text, [
      hashValue,
      HASH_MARKER,
      USERNAME,
      PASSWORD,
      SECRET,
    ]);
  });

  it("logs a missing username without the hash or the username value", async () => {
    const passwordHash = await hash(PASSWORD, 4);
    delete process.env.AUTH_USERNAME;
    process.env.AUTH_PASSWORD_HASH = passwordHash;

    expect(() => assertAuthConfigured()).toThrow(AuthConfigError);
    const text = logged();
    expect(text).toBe("[auth] AUTH_USERNAME is missing.");
    expectNoSecretMaterial(text, [passwordHash, PASSWORD, SECRET]);
  });

  it("does not log when the username and hash are valid, or when the password is wrong", async () => {
    const passwordHash = await hash(PASSWORD, 4);
    process.env.AUTH_PASSWORD_HASH = passwordHash;
    assertAuthConfigured();
    await expect(verifyCredentials(USERNAME, "wrong-password")).resolves.toBe(
      false,
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe("SESSION_SECRET validation logs", () => {
  const hashCanary = `$2a$${HASH_MARKER}${"B".repeat(60 - 4 - HASH_MARKER.length)}`;

  beforeEach(() => {
    process.env.AUTH_USERNAME = USERNAME;
    process.env.AUTH_PASSWORD_HASH = hashCanary;
  });

  it("logs a missing secret with length 0", () => {
    delete process.env.SESSION_SECRET;
    try {
      readSessionSecret();
      expect.fail("expected configuration to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthConfigError);
      const message = (error as Error).message;
      expect(message).toMatch(/32 characters/);
      expect(message).not.toMatch(/length \d+/);
      expectNoSecretMaterial(message, [USERNAME, hashCanary, HASH_MARKER]);
    }

    const text = logged();
    expect(text).toBe(
      "[auth] SESSION_SECRET is missing (length 0, expected at least 32).",
    );
    expectNoSecretMaterial(text, [USERNAME, hashCanary, HASH_MARKER]);
  });

  it("logs a too-short secret with its length only", () => {
    const secret = "canary-short-secret";
    expect(secret.length).toBeLessThan(MIN_SESSION_SECRET_LENGTH);
    process.env.SESSION_SECRET = secret;

    try {
      assertSessionSecret(secret);
      expect.fail("expected configuration to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthConfigError);
      const message = (error as Error).message;
      expect(message).toMatch(/32 characters/);
      expect(message).not.toContain(secret);
      expect(message).not.toContain(`length ${secret.length}`);
      expectNoSecretMaterial(message, [
        secret,
        USERNAME,
        hashCanary,
        HASH_MARKER,
      ]);
    }

    const text = logged();
    expect(text).toBe(
      `[auth] SESSION_SECRET is too short (length ${secret.length}, expected at least ${MIN_SESSION_SECRET_LENGTH}).`,
    );
    expectNoSecretMaterial(text, [secret, USERNAME, hashCanary, HASH_MARKER]);
  });

  it("does not log a secret that is long enough", () => {
    assertSessionSecret("x".repeat(MIN_SESSION_SECRET_LENGTH));
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
