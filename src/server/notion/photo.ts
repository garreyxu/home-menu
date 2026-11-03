import type {
  NotionBlock,
  NotionFile,
  PhotoChoice,
} from "@/server/notion/types";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export function fileUrl(file: NotionFile | null | undefined): string | null {
  if (!file) return null;
  if (file.type === "external") return file.external?.url ?? null;
  if (file.type === "file" || file.file?.url) return file.file?.url ?? null;
  return file.external?.url ?? null;
}

/** Identity ignores the signed query string, which Notion rotates about every hour. */
export function fileIdentity(url: string): string {
  const parsed = new URL(url);
  return `${parsed.host}${decodeURIComponent(parsed.pathname)}`;
}

export function assertDownloadUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("照片地址无效");
  }
  if (url.protocol !== "https:") throw new Error("照片地址不是 https");
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal" ||
    host === "metadata.internal" ||
    isPrivateIp(host)
  ) {
    throw new Error("照片地址不安全");
  }
  return url;
}

function isPrivateIp(host: string): boolean {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((part) => part > 255)) return true;
    const a = parts[0] ?? 0;
    const b = parts[1] ?? 0;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  const v6 = (host.startsWith("[") ? host.slice(1, -1) : host).toLowerCase();
  if (!v6.includes(":")) return false;
  return (
    v6 === "::1" ||
    v6 === "::" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe80")
  );
}

function findImage(blocks: readonly NotionBlock[]): PhotoChoice | null {
  for (const block of blocks) {
    if (block.type === "image") {
      const url = fileUrl(block.image);
      if (url) {
        return {
          kind: "image",
          url,
          sourceKey: `body:${block.id}:${fileIdentity(url)}`,
        };
      }
    }
    if (block.children && block.children.length > 0) {
      const nested = findImage(block.children);
      if (nested) return nested;
    }
  }
  return null;
}

/** First image in document order, then the page cover, then no photo. */
export function selectPhoto(
  blocks: readonly NotionBlock[] | null,
  cover: NotionFile | null,
): PhotoChoice {
  if (blocks) {
    const found = findImage(blocks);
    if (found) return found;
  }
  const coverUrl = fileUrl(cover);
  if (coverUrl) {
    return {
      kind: "image",
      url: coverUrl,
      sourceKey: `cover:${fileIdentity(coverUrl)}`,
    };
  }
  return { kind: "placeholder" };
}

export function sniffImage(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export async function downloadImage(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  let current = assertDownloadUrl(rawUrl).toString();
  for (let hop = 0; hop < 3; hop += 1) {
    const response = await fetchImpl(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("照片下载失败");
      current = assertDownloadUrl(
        new URL(location, current).toString(),
      ).toString();
      continue;
    }
    if (!response.ok) throw new Error(`照片下载失败（${response.status}）`);
    const bytes = await readLimited(response);
    const contentType = sniffImage(bytes);
    if (!contentType) throw new Error("不是支持的图片");
    return { bytes, contentType };
  }
  throw new Error("照片下载失败");
}

async function readLimited(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("照片是空的");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) throw new Error("照片太大");
    chunks.push(value);
  }
  if (total === 0) throw new Error("照片是空的");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
