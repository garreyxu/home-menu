const LOCAL_ORIGIN = "http://local.invalid";
const MAX_NEXT_LENGTH = 2048;

function fullyDecode(value: string): string | null {
  let current = value;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (decoded === current) return current;
    current = decoded;
  }
  return current;
}

/**
 * Accept only a same-origin relative path. Anything else, including
 * protocol-relative URLs and encoded slashes, becomes "/".
 */
export function sanitizeNextPath(value: string | null | undefined): string {
  if (typeof value !== "string") return "/";
  const candidate = value.trim();
  if (candidate.length === 0 || candidate.length > MAX_NEXT_LENGTH) return "/";

  const decoded = fullyDecode(candidate);
  if (decoded === null) return "/";
  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.startsWith("/\\")
  ) {
    return "/";
  }
  if (decoded.includes("\\") || decoded.includes("://")) return "/";
  if (/[\u0000-\u001F\u007F]/.test(decoded)) return "/";

  let url: URL;
  try {
    url = new URL(decoded, LOCAL_ORIGIN);
  } catch {
    return "/";
  }
  if (url.origin !== LOCAL_ORIGIN) return "/";
  if (url.username || url.password) return "/";
  if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) {
    return "/";
  }
  if (url.pathname === "/login" || url.pathname.startsWith("/login/")) {
    return "/";
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
