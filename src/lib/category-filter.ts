export function categoryFilterHref(
  name: string | null,
  week?: string | null,
): string {
  const params = new URLSearchParams();
  if (name) params.set("category", name);
  if (week) params.set("week", week);
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function firstQueryValue(
  value: string | string[] | undefined,
): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}
