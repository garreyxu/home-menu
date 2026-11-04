import { classifyNotionPage } from "@/server/notion/map-page";
import { normalizeNotionId } from "@/server/notion/ids";
import type { ImportReport, NotionSkip } from "@/server/notion/report";
import type { NotionPageSnapshot } from "@/server/notion/types";

export type StoredNotionDish = {
  id: string;
  notionPageId: string;
  name: string;
  isActive: boolean;
};

export type UpsertDish = {
  notionPageId: string;
  name: string;
  categoryName: string;
  description: string | null;
  cookTime: string | null;
  ingredients: string | null;
  rating: string | null;
  tried: boolean;
  cuisines: string[];
  mainIngredient: string | null;
  body: { blocks: unknown[] };
  hasBody: boolean;
};

export type RetireResult = {
  deleted: number;
  inactivated: number;
};

export interface DishRepository {
  listNotionDishes(): Promise<StoredNotionDish[]>;
  /** Insert or overwrite by Notion page id. Does not delete the row. */
  upsert(dish: UpsertDish): Promise<"added" | "updated">;
  /**
   * Drop Notion dishes that no longer qualify.
   * A dish still referenced by a weekly menu stays inactive.
   * A dish with no menu rows is deleted.
   * Ids that were never imported are ignored.
   */
  retire(notionPageIds: readonly string[]): Promise<RetireResult>;
  /** Same counts as retire, without writing. */
  removalPlan(notionPageIds: readonly string[]): Promise<RetireResult>;
  countOnWall(): Promise<{ onWall: number }>;
}

/** More removals than this, or an empty Notion result, are held back. */
export function removalCeiling(activeImported: number): number {
  return Math.max(3, activeImported * 0.2);
}

export async function importNotionCatalog(input: {
  loadPages: () => Promise<NotionPageSnapshot[]>;
  dishes: DishRepository;
  /** CLI-only. The cron and the sync button leave this false. */
  allowMassRemoval?: boolean;
}): Promise<ImportReport> {
  const pages = await input.loadPages();
  const existingRows = await input.dishes.listNotionDishes();

  const keep = new Set<string>();
  const skipped: NotionSkip[] = [];
  const warnings: string[] = [];
  let noSteps = 0;
  let errored = 0;
  let tried = 0;
  let added = 0;
  let updated = 0;

  for (const page of pages) {
    const pageId = normalizeNotionId(page.id);
    const classified = classifyNotionPage(page);
    if (classified.kind === "errored") {
      keep.add(pageId);
      errored += 1;
      continue;
    }
    if (classified.kind === "skip") {
      keep.add(pageId);
      skipped.push({
        pageId,
        name: classified.name,
        reason: classified.reason,
      });
      continue;
    }
    if (classified.kind === "no_steps") {
      noSteps += 1;
      continue;
    }

    const mapped = classified.dish;
    keep.add(pageId);
    const result = await input.dishes.upsert({
      notionPageId: mapped.notionPageId,
      name: mapped.name,
      categoryName: mapped.categoryName,
      description: mapped.description,
      cookTime: mapped.cookTime,
      ingredients: mapped.ingredients,
      rating: mapped.rating,
      tried: mapped.tried,
      cuisines: mapped.cuisines,
      mainIngredient: mapped.mainIngredient,
      body: mapped.body,
      hasBody: mapped.hasBody,
    });
    if (result === "added") added += 1;
    else updated += 1;
    if (mapped.tried) tried += 1;
  }

  const retireIds = [
    ...new Set(
      existingRows
        .map((row) => normalizeNotionId(row.notionPageId))
        .filter((id) => !keep.has(id)),
    ),
  ];
  const activeImported = existingRows.filter((row) => row.isActive).length;
  const planned = await input.dishes.removalPlan(retireIds);
  const wouldRemove = planned.deleted + planned.inactivated;
  const removalsSkipped =
    !input.allowMassRemoval &&
    (pages.length === 0 || wouldRemove > removalCeiling(activeImported));
  const retired = removalsSkipped
    ? { deleted: 0, inactivated: 0 }
    : await input.dishes.retire(retireIds);
  const wall = await input.dishes.countOnWall();

  return {
    imported: added + updated,
    tried,
    noSteps,
    errored,
    added,
    updated,
    deleted: retired.deleted,
    inactivated: retired.inactivated,
    wouldRemove,
    removalsSkipped,
    onWall: wall.onWall,
    skipped: capSkips(skipped),
    warnings: capWarnings(warnings),
  };
}

function capSkips(skipped: NotionSkip[]): NotionSkip[] {
  if (skipped.length <= 20) return skipped;
  return skipped.slice(0, 20);
}

function capWarnings(warnings: string[]): string[] {
  if (warnings.length <= 20) return warnings;
  const extra = warnings.length - 19;
  return [...warnings.slice(0, 19), `还有 ${extra} 条提示没列出。`];
}
