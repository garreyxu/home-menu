import { createHash } from "node:crypto";

const MAX_PHOTO_BYTES = 1_500_000;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export type StoredDrinkPhoto = {
  base64: string;
  contentType: string;
  fingerprint: string;
};

/** Stable identity of a Notion file, ignoring the expiring query signature. */
export function drinkPhotoFingerprint(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return createHash("sha256")
      .update(`${parsed.origin}${parsed.pathname}`)
      .digest("hex");
  } catch {
    return null;
  }
}

export function allowedPhotoHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  if (!host || host === "localhost" || host.endsWith(".local")) return false;
  if (host === "169.254.169.254" || host.endsWith(".internal")) return false;
  return (
    host.endsWith(".amazonaws.com") ||
    host.endsWith(".notion.so") ||
    host.endsWith(".notion-static.com") ||
    host === "notion.so"
  );
}

/**
 * Copy a Notion file onto our side. Returns null when the file cannot be kept.
 * The caller must not store or log the URL.
 */
export async function downloadDrinkPhoto(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Omit<StoredDrinkPhoto, "fingerprint"> | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !allowedPhotoHost(parsed.hostname)) {
    return null;
  }
  const response = await fetchPhoto(parsed, fetchImpl);
  if (!response) return null;
  const contentType = (response.headers.get("content-type") ?? "")
    .split(";")[0]!
    .trim()
    .toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) return null;
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_PHOTO_BYTES) return null;
  const bytes = await readLimited(response);
  if (!bytes) return null;
  return { base64: bytes.toString("base64"), contentType };
}

async function fetchPhoto(
  initial: URL,
  fetchImpl: typeof fetch,
): Promise<Response | null> {
  let current = initial;
  for (let hop = 0; hop < 3; hop += 1) {
    let response: Response;
    try {
      response = await fetchImpl(current.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return null;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return null;
      }
      if (next.protocol !== "https:" || !allowedPhotoHost(next.hostname)) {
        return null;
      }
      current = next;
      continue;
    }
    if (!response.ok) return null;
    return response;
  }
  return null;
}

async function readLimited(response: Response): Promise<Buffer | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_PHOTO_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } catch {
    return null;
  }
  if (total === 0) return null;
  return Buffer.concat(chunks);
}

export function decodeStoredPhoto(
  photo: string | null,
  photoType: string | null,
): { bytes: Buffer; contentType: string } | null {
  if (!photo || !photoType || !ALLOWED_TYPES.has(photoType)) return null;
  try {
    const bytes = Buffer.from(photo, "base64");
    if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) return null;
    return { bytes, contentType: photoType };
  } catch {
    return null;
  }
}
