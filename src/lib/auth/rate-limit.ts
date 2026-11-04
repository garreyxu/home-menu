/**
 * In-memory per-IP login failure limiter.
 *
 * Five failures inside a 15-minute counting window lock that IP for 15
 * minutes, measured from the fifth failure. A failure stops counting once
 * it is 15 minutes old. A successful login clears the counter.
 *
 * The counters live in this server process only. They reset when the process
 * restarts and are not shared across instances, so on Vercel each isolate has
 * its own window. This is a basic brake for v1, not a global lockout.
 */
export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

type Bucket = {
  failures: number[];
  lockedUntil: number | null;
};

const buckets = new Map<string, Bucket>();

function countingFailures(failures: number[], nowMs: number): number[] {
  return failures.filter((timestamp) => nowMs - timestamp < LOGIN_WINDOW_MS);
}

export function resetLoginRateLimit(): void {
  buckets.clear();
}

export function isLoginRateLimited(ip: string, nowMs = Date.now()): boolean {
  const bucket = buckets.get(ip);
  if (!bucket) return false;
  if (bucket.lockedUntil !== null && nowMs < bucket.lockedUntil) return true;

  bucket.lockedUntil = null;
  bucket.failures = countingFailures(bucket.failures, nowMs);
  if (bucket.failures.length === 0) buckets.delete(ip);
  return false;
}

export function recordLoginFailure(ip: string, nowMs = Date.now()): void {
  const existing = buckets.get(ip);
  const bucket: Bucket = existing ?? { failures: [], lockedUntil: null };
  if (!existing) buckets.set(ip, bucket);

  if (bucket.lockedUntil !== null && nowMs >= bucket.lockedUntil) {
    bucket.lockedUntil = null;
  }
  bucket.failures = countingFailures(bucket.failures, nowMs);
  // The lock stays anchored to the fifth failure.
  if (bucket.lockedUntil !== null) return;

  bucket.failures.push(nowMs);
  if (bucket.failures.length >= LOGIN_FAILURE_LIMIT) {
    bucket.lockedUntil = nowMs + LOGIN_LOCK_MS;
  }
}

export function clearLoginFailures(ip: string): void {
  buckets.delete(ip);
}

/** Remaining lock time, or null when this IP is not locked. */
export function loginLockRemainingMs(
  ip: string,
  nowMs = Date.now(),
): number | null {
  const bucket = buckets.get(ip);
  if (!bucket?.lockedUntil || nowMs >= bucket.lockedUntil) return null;
  return bucket.lockedUntil - nowMs;
}

export function clientAddress(headerList: Headers): string {
  const forwarded = headerList.get("x-forwarded-for");
  const candidates = [forwarded?.split(",")[0], headerList.get("x-real-ip")];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim() ?? "";
    if (!trimmed) continue;
    const cleaned = trimmed.replace(/[^0-9A-Za-z:.]/g, "").slice(0, 128);
    if (cleaned) return cleaned;
  }
  return "unknown";
}
