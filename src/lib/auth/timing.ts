import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Compare two strings without leaking their contents through the comparison
 * itself. Hashing first keeps the compared buffers the same length.
 */
export function timingSafeEqualString(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}
