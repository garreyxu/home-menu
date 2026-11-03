import { beforeEach, describe, expect, it } from "vitest";
import {
  LOGIN_FAILURE_LIMIT,
  LOGIN_LOCK_MS,
  LOGIN_WINDOW_MS,
  clearLoginFailures,
  clientAddress,
  isLoginRateLimited,
  recordLoginFailure,
  resetLoginRateLimit,
} from "@/lib/auth/rate-limit";

const IP = "203.0.113.5";
const OTHER_IP = "203.0.113.6";
const START = 1_000_000;
const FOURTEEN_MINUTES_59_SECONDS = 14 * 60 * 1000 + 59 * 1000;

beforeEach(() => {
  resetLoginRateLimit();
});

function failTimes(ip: string, at: number, times: number): void {
  for (let attempt = 0; attempt < times; attempt += 1) {
    recordLoginFailure(ip, at);
  }
}

describe("login rate limit", () => {
  it("locks an address on the fifth failure", () => {
    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT; attempt += 1) {
      expect(isLoginRateLimited(IP, START)).toBe(false);
      recordLoginFailure(IP, START);
    }
    expect(isLoginRateLimited(IP, START)).toBe(true);
    expect(isLoginRateLimited(OTHER_IP, START)).toBe(false);
  });

  it("stays locked at 14:59 after the fifth failure and unlocks at 15:00", () => {
    // The first failure is 10 minutes earlier. A lock measured from that
    // first failure would already have expired 14:59 after the fifth.
    const fifth = START + 10 * 60 * 1000;
    recordLoginFailure(IP, START);
    failTimes(IP, fifth, LOGIN_FAILURE_LIMIT - 1);

    expect(isLoginRateLimited(IP, fifth)).toBe(true);
    expect(isLoginRateLimited(IP, fifth + FOURTEEN_MINUTES_59_SECONDS)).toBe(
      true,
    );
    expect(isLoginRateLimited(IP, fifth + LOGIN_LOCK_MS)).toBe(false);
    recordLoginFailure(IP, fifth + LOGIN_LOCK_MS);
    expect(isLoginRateLimited(IP, fifth + LOGIN_LOCK_MS)).toBe(false);
  });

  it("clears the counter and the lock after a successful login", () => {
    failTimes(IP, START, LOGIN_FAILURE_LIMIT);
    expect(isLoginRateLimited(IP, START)).toBe(true);

    clearLoginFailures(IP);
    expect(isLoginRateLimited(IP, START)).toBe(false);
    expect(isLoginRateLimited(IP, START + FOURTEEN_MINUTES_59_SECONDS)).toBe(
      false,
    );

    failTimes(IP, START, LOGIN_FAILURE_LIMIT - 1);
    expect(isLoginRateLimited(IP, START)).toBe(false);
  });

  it("does not count failures that are 15 minutes old", () => {
    failTimes(IP, START, LOGIN_FAILURE_LIMIT - 1);
    const stillInside = START + LOGIN_WINDOW_MS - 1;
    expect(isLoginRateLimited(IP, stillInside)).toBe(false);
    recordLoginFailure(IP, stillInside);
    expect(isLoginRateLimited(IP, stillInside)).toBe(true);

    resetLoginRateLimit();
    failTimes(IP, START, LOGIN_FAILURE_LIMIT - 1);
    const expired = START + LOGIN_WINDOW_MS;
    recordLoginFailure(IP, expired);
    expect(isLoginRateLimited(IP, expired)).toBe(false);
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
