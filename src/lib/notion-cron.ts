export const NOTION_CRON_PATH = "/api/cron/notion-sync";

export function bearerMatches(
  authorization: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const given = authorization.slice("Bearer ".length);
  if (given.length !== secret.length || given.length === 0) return false;
  let mismatch = 0;
  for (let index = 0; index < given.length; index += 1) {
    mismatch |= given.charCodeAt(index) ^ secret.charCodeAt(index);
  }
  return mismatch === 0;
}
