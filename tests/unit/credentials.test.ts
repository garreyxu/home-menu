import { hash } from "bcryptjs";
import { afterEach, describe, expect, it } from "vitest";
import { AuthConfigError } from "@/lib/auth/config-error";
import { verifyCredentials } from "@/lib/auth/credentials";

const originalUsername = process.env.AUTH_USERNAME;
const originalHash = process.env.AUTH_PASSWORD_HASH;

afterEach(() => {
  if (originalUsername === undefined) delete process.env.AUTH_USERNAME;
  else process.env.AUTH_USERNAME = originalUsername;
  if (originalHash === undefined) delete process.env.AUTH_PASSWORD_HASH;
  else process.env.AUTH_PASSWORD_HASH = originalHash;
});

describe("verifyCredentials", () => {
  it("accepts the configured username and password only", async () => {
    const password = "fixture-password";
    const passwordHash = await hash(password, 4);
    process.env.AUTH_USERNAME = "family";
    process.env.AUTH_PASSWORD_HASH = passwordHash;

    await expect(verifyCredentials("family", password)).resolves.toBe(true);
    await expect(verifyCredentials("other", password)).resolves.toBe(false);
    await expect(verifyCredentials("family", "nope")).resolves.toBe(false);
    await expect(verifyCredentials("family", "")).resolves.toBe(false);
  });

  it("fails closed without echoing the hash when configuration is missing or invalid", async () => {
    delete process.env.AUTH_USERNAME;
    delete process.env.AUTH_PASSWORD_HASH;
    await expect(verifyCredentials("family", "fixture")).rejects.toBeInstanceOf(
      AuthConfigError,
    );

    process.env.AUTH_USERNAME = "family";
    process.env.AUTH_PASSWORD_HASH = "not-a-bcrypt-hash";
    try {
      await verifyCredentials("family", "fixture");
      expect.fail("expected configuration to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthConfigError);
      const message = (error as Error).message;
      expect(message).toMatch(/bcrypt/);
      expect(message).not.toContain("not-a-bcrypt-hash");
      expect(message).not.toContain("fixture");
    }
  });
});
