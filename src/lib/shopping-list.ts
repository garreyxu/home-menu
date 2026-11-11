import {
  ingredientGroup,
  INGREDIENT_GROUPS,
  isPantryIngredient,
  type IngredientGroup,
} from "./ingredient-groups";

export type ShoppingRow = { name: string; dishes: string[]; optional: boolean };
export type ShoppingList = {
  groups: { name: IngredientGroup; rows: ShoppingRow[] }[];
  pantry: ShoppingRow[];
};
export type ShoppingMenuItem = {
  dishName?: string | null;
  ingredients?: string | null;
  customName?: string | null;
};

/** Uses only the synced ingredients property, never recipe bodies. */
export function buildShoppingList(
  items: readonly ShoppingMenuItem[],
): ShoppingList {
  const rows = new Map<string, ShoppingRow>();
  for (const item of items) {
    if (item.customName || !item.dishName || !item.ingredients) continue;
    for (const part of item.ingredients.split(/[，,]/)) {
      const trimmed = part.trim();
      const optional = /(?:\(\s*optional\s*\)|（\s*optional\s*）)\s*$/i.test(
        trimmed,
      );
      const name = trimmed
        .replace(/(?:\(\s*optional\s*\)|（\s*optional\s*）)\s*$/i, "")
        .trim();
      if (!name) continue;
      const row = rows.get(name);
      if (row) {
        row.optional &&= optional;
        if (!row.dishes.includes(item.dishName)) row.dishes.push(item.dishName);
      } else rows.set(name, { name, dishes: [item.dishName], optional });
    }
  }
  const all = [...rows.values()];
  return {
    groups: INGREDIENT_GROUPS.map((name) => ({
      name,
      rows: all.filter(
        (row) =>
          !isPantryIngredient(row.name) && ingredientGroup(row.name) === name,
      ),
    })).filter((group) => group.rows.length),
    pantry: all.filter((row) => isPantryIngredient(row.name)),
  };
}
export function shoppingRows(list: ShoppingList): ShoppingRow[] {
  return [...list.groups.flatMap((group) => group.rows), ...list.pantry];
}

export function missingShoppingDishes(
  items: readonly ShoppingMenuItem[],
): string[] {
  return [
    ...new Set(
      items
        .filter(
          (item) =>
            !item.customName && item.dishName && !item.ingredients?.trim(),
        )
        .map((item) => item.dishName!),
    ),
  ];
}
