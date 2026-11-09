/** Notion select whose option name is the wall category. */
export const MAIN_INGREDIENT_PROPERTY = "主要食材种类";

/**
 * Wall order for known 「主要食材种类」 options.
 * This is an order, not a translation table: a name is whatever Notion
 * returned at sync time. A name that is not in this list is still a category.
 */
export const CATEGORY_DISPLAY_ORDER = [
  "猪",
  "牛",
  "鸡",
  "羊",
  "海鲜",
  "米饭",
  "面条",
  "素菜",
  "豆制品",
  "蛋制品",
  "汤",
  "饼",
  "早餐",
  "酱汁",
  "其他",
] as const;

/** Blank 「主要食材种类」 is stored under this category. It sorts last. */
export const FALLBACK_CATEGORY = "其他";

/**
 * Sort category names for the nav.
 *
 * Names in {@link CATEGORY_DISPLAY_ORDER} keep that sequence. 「其他」 is
 * always last among the names that were actually passed in: it is the
 * catch-all for a blank select, so it stays the final tag instead of
 * sitting in the middle of options someone added in Notion.
 *
 * A name that is not in the display-order list is an unknown option. Unknown
 * options are inserted immediately before 「其他」, in the order Notion listed
 * them on the select (the data source's `options` array). That way a new
 * option shows up on the next sync without a deploy, and two new options
 * keep the order the family arranged in Notion. An unknown name that is no
 * longer in the schema (still stored on a dish) is placed after the unknowns
 * that are in the schema, still before 「其他」, in the order it was given.
 *
 * Names that were not passed in are not invented. A known option with no
 * dishes is omitted by the caller.
 */
export function orderCategoryNames(
  names: readonly string[],
  notionOptionOrder: readonly string[] = [],
): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }

  const knownIndex = new Map<string, number>(
    CATEGORY_DISPLAY_ORDER.map((name, index) => [name, index]),
  );
  const notionIndex = new Map<string, number>();
  for (const [index, name] of notionOptionOrder.entries()) {
    const trimmed = name.trim();
    if (trimmed && !notionIndex.has(trimmed)) notionIndex.set(trimmed, index);
  }
  const encounter = new Map(unique.map((name, index) => [name, index]));

  function rank(name: string): [number, number, number] {
    if (name === FALLBACK_CATEGORY) return [2, 0, 0];
    const known = knownIndex.get(name);
    if (known !== undefined) return [0, known, 0];
    const notion = notionIndex.get(name);
    if (notion !== undefined) return [1, 0, notion];
    return [1, 1, encounter.get(name) ?? 0];
  }

  return unique.sort((left, right) => {
    const [bandLeft, groupLeft, orderLeft] = rank(left);
    const [bandRight, groupRight, orderRight] = rank(right);
    if (bandLeft !== bandRight) return bandLeft - bandRight;
    if (groupLeft !== groupRight) return groupLeft - groupRight;
    return orderLeft - orderRight;
  });
}

export type CategoryAlignInput = {
  id: string;
  name: string;
};

/**
 * Sort orders to write, and category ids to delete.
 *
 * A category no dish references is stale: the option was renamed or removed,
 * or it was a 「类型」 value nothing points at anymore. Delete it.
 * A category an inactive dish still references is kept so `category_id`
 * stays valid; the wall hides it when it has no active dishes.
 */
export function planCategoryAlignment(input: {
  categories: readonly CategoryAlignInput[];
  referencedCategoryIds: ReadonlySet<string>;
  notionOptionOrder: readonly string[];
}): { sort: { id: string; sortOrder: number }[]; deleteIds: string[] } {
  const deleteIds: string[] = [];
  const kept: CategoryAlignInput[] = [];
  for (const category of input.categories) {
    if (input.referencedCategoryIds.has(category.id)) kept.push(category);
    else deleteIds.push(category.id);
  }

  const orderedNames = orderCategoryNames(
    kept.map((category) => category.name),
    input.notionOptionOrder,
  );
  const byName = new Map(kept.map((category) => [category.name, category]));
  const sort = orderedNames.flatMap((name, sortOrder) => {
    const category = byName.get(name);
    return category ? [{ id: category.id, sortOrder }] : [];
  });
  return { sort, deleteIds };
}
