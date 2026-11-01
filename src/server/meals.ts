export const MEALS = ["breakfast", "lunch", "dinner"] as const;

export type Meal = (typeof MEALS)[number];

export function isMeal(value: string): value is Meal {
  return (MEALS as readonly string[]).includes(value);
}
