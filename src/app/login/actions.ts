"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyCredentials } from "@/lib/auth/credentials";
import {
  INVALID_CREDENTIALS_MESSAGE,
  RATE_LIMITED_MESSAGE,
  type LoginState,
} from "@/lib/auth/messages";
import { sanitizeNextPath } from "@/lib/auth/next-path";
import {
  clearLoginFailures,
  clientAddress,
  isLoginRateLimited,
  recordLoginFailure,
} from "@/lib/auth/rate-limit";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  signSession,
} from "@/lib/auth/session";

function formText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export async function login(
  _state: LoginState | null,
  formData: FormData,
): Promise<LoginState> {
  const headerList = await headers();
  const ip = clientAddress(headerList);

  if (isLoginRateLimited(ip)) {
    return { error: RATE_LIMITED_MESSAGE };
  }

  const username = formText(formData.get("username"));
  const password = formText(formData.get("password"));
  const nextPath = sanitizeNextPath(formText(formData.get("next")) || null);

  const valid = await verifyCredentials(username, password);
  if (!valid) {
    recordLoginFailure(ip);
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  clearLoginFailures(ip);
  const token = await signSession();
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  redirect(nextPath);
}
