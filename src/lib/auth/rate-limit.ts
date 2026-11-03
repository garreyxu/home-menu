/**
 * In-memory per-IP login failure limiter: 5 failures per 10 minutes.
 *
 * The counters live in this server process only. They reset when the process
 * restarts and are not shared across instances, so on Vercel each isolate has
 * its own window. This is a basic brake for v1, not a global lockout.
 */
export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_WINDOW_MS = 10 * 60 * 1000;

type Bucket = {
  failures: number;
  windowStart: number;
};

const buckets = new Map<string, Bucket>();

export function resetLoginRateLimit(): void {
  buckets.clear();
}

export function isLoginRateLimited(ip: string, nowMs = Date.now()): boolean {
  const bucket = buckets.get(ip);
  if (!bucket) return false;
  if (nowMs - bucket.windowStart >= LOGIN_WINDOW_MS) {
    buckets.delete(ip);
    return false;
  }
  return bucket.failures >= LOGIN_FAILURE_LIMIT;
}

export function recordLoginFailure(ip: string, nowMs = Date.now()): void {
  const bucket = buckets.get(ip);
  if (!bucket || nowMs - bucket.windowStart >= LOGIN_WINDOW_MS) {
    buckets.set(ip, { failures: 1, windowStart: nowMs });
    return;
  }
  bucket.failures += 1;
}

export function clearLoginFailures(ip: string): void {
  buckets.delete(ip);
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
