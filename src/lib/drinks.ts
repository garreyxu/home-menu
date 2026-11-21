export type DrinkTags = {
  baseSpirits: readonly string[];
};

export function drinkBaseOptions(drinks: readonly DrinkTags[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const drink of drinks) {
    for (const name of drink.baseSpirits) {
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }
  return names.sort((a, b) => a.localeCompare(b, "zh"));
}

export function filterDrinksByBase<T extends DrinkTags>(
  drinks: readonly T[],
  base: string | null,
): T[] {
  if (!base) return [...drinks];
  return drinks.filter((drink) => drink.baseSpirits.includes(base));
}

export function drinkFilterHref(base: string | null): string {
  if (!base) return "/drinks";
  return `/drinks?base=${encodeURIComponent(base)}`;
}
