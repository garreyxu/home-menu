export function categoryFilterHref(name: string | null): string {
  if (!name) return "/";
  return `/?${new URLSearchParams({ category: name }).toString()}`;
}

export function firstQueryValue(
  value: string | string[] | undefined,
): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}
