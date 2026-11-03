/** Canonical dashed id so `abc…` and `abc-…` dedupe as one page. */
export function normalizeNotionId(id: string): string {
  const trimmed = id.trim().toLowerCase();
  const hex = trimmed.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/.test(hex)) return trimmed;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
