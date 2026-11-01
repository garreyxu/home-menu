import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE_NAME,
  readSessionSecret,
  verifySession,
} from "@/lib/auth/session";

export type Session = {
  subject: string;
};

async function readVerifiedSession(): Promise<Session | null> {
  // A missing or short secret must surface as a server error, not as a redirect.
  readSessionSecret();
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Redirect to /login when the session cookie is missing or invalid. */
export async function requireSession(): Promise<Session> {
  const session = await readVerifiedSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * For route handlers. Returns a 401 response when the session is missing or
 * invalid, and null when the caller may continue.
 */
export async function requireApiSession(): Promise<Response | null> {
  const session = await readVerifiedSession();
  if (session) return null;
  return Response.json(
    { error: "Unauthorized" },
    {
      status: 401,
      headers: { "cache-control": "no-store" },
    },
  );
}
