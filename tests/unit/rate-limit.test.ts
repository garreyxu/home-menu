import { beforeEach, describe, expect, it } from "vitest";
import {
  LOGIN_FAILURE_LIMIT,
  LOGIN_WINDOW_MS,
  clearLoginFailures,
  clientAddress,
  isLoginRateLimited,
  recordLoginFailure,
  resetLoginRateLimit,
} from "@/lib/auth/rate-limit";

beforeEach(() => {
  resetLoginRateLimit();
});

describe("login rate limit", () => {
  it("blocks an address after 5 failures inside the window", () => {
    const ip = "203.0.113.5";
    const start = 1_000_000;
    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT; attempt += 1) {
      expect(isLoginRateLimited(ip, start)).toBe(false);
      recordLoginFailure(ip, start);
    }
    expect(isLoginRateLimited(ip, start)).toBe(true);
    expect(isLoginRateLimited("203.0.113.6", start)).toBe(false);
    expect(isLoginRateLimited(ip, start + LOGIN_WINDOW_MS)).toBe(false);
  });

  it("clears failures after a successful login", () => {
    const ip = "203.0.113.5";
    recordLoginFailure(ip, 1);
    clearLoginFailures(ip);
    expect(isLoginRateLimited(ip, 1)).toBe(false);
  });
});

describe("clientAddress", () => {
  it("uses the first forwarded address, then x-real-ip", () => {
    expect(
      clientAddress(
        new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }),
      ),
    ).toBe("203.0.113.9");
    expect(clientAddress(new Headers({ "x-real-ip": "2001:db8::1" }))).toBe(
      "2001:db8::1",
    );
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});
