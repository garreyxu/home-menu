import { SignJWT, jwtVerify } from "jose";
import { AuthConfigError } from "@/lib/auth/config-error";

export const SESSION_COOKIE_NAME = "hm_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const MIN_SESSION_SECRET_LENGTH = 32;

const SESSION_SUBJECT = "family";

export function assertSessionSecret(secret: string): void {
  if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new AuthConfigError(
      "SESSION_SECRET must be set to at least 32 characters. Refusing to authenticate.",
    );
  }
}

export function readSessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? "";
  assertSessionSecret(secret);
  return secret;
}

export type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  expires: Date;
};

export function sessionCookieOptions(
  now = Date.now(),
  nodeEnv: string | undefined = process.env.NODE_ENV,
): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    expires: new Date(now + SESSION_MAX_AGE_SECONDS * 1000),
  };
}

export function clearedSessionCookieOptions(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: nodeEnv === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };
}

type SignSessionOptions = {
  secret?: string;
  expiresInSeconds?: number;
  issuedAt?: number;
};

function secretKey(secret: string): Uint8Array {
  assertSessionSecret(secret);
  return new TextEncoder().encode(secret);
}

/**
 * Sign a session JWT with HS256. The key is the raw SESSION_SECRET bytes.
 * This module stays free of bcrypt and node:crypto so proxy can verify
 * tokens with Web Crypto on the edge or on Node.
 */
export async function signSession(
  options: SignSessionOptions = {},
): Promise<string> {
  const secret = options.secret ?? readSessionSecret();
  const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
  const lifetime = options.expiresInSeconds ?? SESSION_MAX_AGE_SECONDS;
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(SESSION_SUBJECT)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + lifetime)
    .sign(secretKey(secret));
}

export async function verifySession(
  token: string,
  secret?: string,
): Promise<{ subject: string } | null> {
  const resolved = secret ?? readSessionSecret();
  try {
    const { payload } = await jwtVerify(token, secretKey(resolved), {
      algorithms: ["HS256"],
      subject: SESSION_SUBJECT,
      requiredClaims: ["exp", "sub"],
    });
    if (payload.sub !== SESSION_SUBJECT) return null;
    return { subject: payload.sub };
  } catch (error) {
    if (error instanceof AuthConfigError) throw error;
    return null;
  }
}
