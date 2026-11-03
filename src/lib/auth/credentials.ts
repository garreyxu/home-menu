import "server-only";
import { compare } from "bcryptjs";
import { AuthConfigError } from "@/lib/auth/config-error";
import { timingSafeEqualString } from "@/lib/auth/timing";

const MAX_INPUT_LENGTH = 1024;
const BCRYPT_HASH_LENGTH = 60;
const BCRYPT_PREFIX = /^\$2[aby]\$/;
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * A safe server-log line for a bad password hash. The returned text never
 * includes the hash, any slice of it, the username, or SESSION_SECRET.
 */
function describePasswordHash(hash: string): string | null {
  if (!hash) return "AUTH_PASSWORD_HASH is missing.";
  if (hash.length !== BCRYPT_HASH_LENGTH) {
    return `AUTH_PASSWORD_HASH has the wrong length (expected ${BCRYPT_HASH_LENGTH}, got ${hash.length}).`;
  }
  if (!BCRYPT_PREFIX.test(hash)) {
    return "AUTH_PASSWORD_HASH has the wrong prefix (expected $2a/$2b/$2y).";
  }
  if (!BCRYPT_HASH.test(hash)) {
    return "AUTH_PASSWORD_HASH is not a valid bcrypt hash.";
  }
  return null;
}

function logAuth(message: string): void {
  console.error(`[auth] ${message}`);
}

export function assertAuthConfigured(): void {
  const username = process.env.AUTH_USERNAME ?? "";
  const passwordHash = process.env.AUTH_PASSWORD_HASH ?? "";
  const hashProblem = describePasswordHash(passwordHash);

  if (hashProblem) logAuth(hashProblem);
  if (!username) logAuth("AUTH_USERNAME is missing.");

  if (!username || !passwordHash) {
    throw new AuthConfigError(
      "AUTH_USERNAME and AUTH_PASSWORD_HASH must be set. Refusing to authenticate.",
    );
  }
  if (hashProblem) {
    throw new AuthConfigError(
      "AUTH_PASSWORD_HASH must be a bcrypt hash. Generate one with pnpm auth:hash. Refusing to authenticate.",
    );
  }
}

export async function verifyCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  assertAuthConfigured();
  const expectedUsername = process.env.AUTH_USERNAME ?? "";
  const passwordHash = process.env.AUTH_PASSWORD_HASH ?? "";
  const boundedUsername = username.length > MAX_INPUT_LENGTH ? "" : username;
  const boundedPassword = password.length > MAX_INPUT_LENGTH ? "" : password;

  const usernameOk = timingSafeEqualString(boundedUsername, expectedUsername);
  let passwordOk = false;
  try {
    passwordOk = await compare(boundedPassword, passwordHash);
  } catch {
    // bcrypt's own error text can quote the hash. Log a fixed line instead.
    logAuth("AUTH_PASSWORD_HASH could not be checked.");
    throw new AuthConfigError(
      "AUTH_PASSWORD_HASH could not be checked. Generate a new hash with pnpm auth:hash.",
    );
  }

  return (
    usernameOk &&
    passwordOk &&
    password.length > 0 &&
    password.length <= MAX_INPUT_LENGTH &&
    username.length <= MAX_INPUT_LENGTH
  );
}
