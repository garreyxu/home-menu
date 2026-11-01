import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  clearedSessionCookieOptions,
} from "@/lib/auth/session";

function endSession(request: Request): NextResponse {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(SESSION_COOKIE_NAME, "", clearedSessionCookieOptions());
  response.headers.set("cache-control", "no-store");
  return response;
}

export function GET(request: Request) {
  return endSession(request);
}

export function POST(request: Request) {
  return endSession(request);
}
