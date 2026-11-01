import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decideAccess } from "@/lib/auth/guard";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "no-store");
  return response;
}

/**
 * Gate every matched request. Verification is HS256 via jose (Web Crypto),
 * so this file must not import bcrypt. Next.js 16 runs proxy on Node, and
 * the same check stays valid if it moves back to the edge runtime.
 */
export async function proxy(request: NextRequest) {
  const decision = await decideAccess({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    nextParam: request.nextUrl.searchParams.get("next"),
    sessionToken: request.cookies.get(SESSION_COOKIE_NAME)?.value,
    secret: process.env.SESSION_SECRET,
    origin: request.nextUrl.origin,
  });

  switch (decision.kind) {
    case "allow":
      return NextResponse.next();
    case "redirect":
      return withNoStore(NextResponse.redirect(decision.to));
    case "unauthorized":
      return withNoStore(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );
    case "misconfigured":
      return withNoStore(
        new NextResponse(decision.message, {
          status: 500,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      );
  }
}

export const config = {
  matcher: [
    // Own matcher so an API path is gated even when it ends in .webp, .js, etc.
    "/api/:path*",
    // Everything else except Next's own static files, the favicon, and
    // public pixel art under public/assets (served at /assets/*).
    "/((?!_next/static|_next/image|favicon.ico|assets/).*)",
  ],
};
