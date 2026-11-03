import "server-only";
import { compare } from "bcryptjs";
import { AuthConfigError } from "@/lib/auth/config-error";
import { timingSafeEqualString } from "@/lib/auth/timing";

const MAX_INPUT_LENGTH = 1024;
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function assertAuthConfigured(): void {
  const username = process.env.AUTH_USERNAME ?? "";
  const passwordHash = process.env.AUTH_PASSWORD_HASH ?? "";
  if (!username || !passwordHash) {
    throw new AuthConfigError(
      "AUTH_USERNAME and AUTH_PASSWORD_HASH must be set. Refusing to authenticate.",
    );
  }
  if (!BCRYPT_HASH.test(passwordHash)) {
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
