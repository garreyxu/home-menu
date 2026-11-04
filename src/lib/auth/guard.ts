import { AuthConfigError } from "@/lib/auth/config-error";
import { sanitizeNextPath } from "@/lib/auth/next-path";
import { NOTION_CRON_PATH, bearerMatches } from "@/lib/notion-cron";
import { assertSessionSecret, verifySession } from "@/lib/auth/session";

export type AccessDecision =
  | { kind: "allow"; authenticated: boolean }
  | { kind: "redirect"; to: string }
  | { kind: "unauthorized" }
  | { kind: "misconfigured"; message: string };

export type AccessRequest = {
  pathname: string;
  search: string;
  nextParam: string | null;
  sessionToken: string | undefined;
  secret: string | undefined;
  origin: string;
  authorization?: string | null;
  cronSecret?: string;
};

function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/logout";
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function misconfiguredMessage(error: unknown): string {
  if (error instanceof AuthConfigError) return error.message;
  return "Authentication is misconfigured.";
}

function loginRedirect(
  origin: string,
  pathname: string,
  search: string,
): string {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return loginUrl.toString();
}

/**
 * Decide whether a request may proceed. Session checks are signature and
 * expiry only; password hashing stays out of this path.
 */
export async function decideAccess(
  request: AccessRequest,
): Promise<AccessDecision> {
  let secret: string;
  try {
    secret = request.secret ?? "";
    assertSessionSecret(secret);
  } catch (error) {
    return { kind: "misconfigured", message: misconfiguredMessage(error) };
  }

  const session = request.sessionToken
    ? await verifySession(request.sessionToken, secret)
    : null;

  if (request.pathname === NOTION_CRON_PATH) {
    if (!bearerMatches(request.authorization, request.cronSecret)) {
      return { kind: "unauthorized" };
    }
    return { kind: "allow", authenticated: false };
  }

  if (isPublicPath(request.pathname)) {
    if (request.pathname === "/login" && session) {
      const nextPath = sanitizeNextPath(request.nextParam);
      return {
        kind: "redirect",
        to: new URL(nextPath, request.origin).toString(),
      };
    }
    return { kind: "allow", authenticated: session !== null };
  }

  if (session) return { kind: "allow", authenticated: true };

  if (isApiPath(request.pathname)) return { kind: "unauthorized" };

  return {
    kind: "redirect",
    to: loginRedirect(request.origin, request.pathname, request.search),
  };
}
