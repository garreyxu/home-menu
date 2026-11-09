import { normalizeNotionId } from "@/server/notion/ids";
import type { NotionBlock } from "@/server/notion/types";

/**
 * Stay under the Hobby function cap (60s) and leave time to commit a partial run.
 * The next sync continues any dish whose recipe_blocks is still null.
 */
export const SYNC_BUDGET_MS = 45_000;

export type RecipePresence = {
  notionPageId: string;
  hasRecipe?: boolean;
  /** Accepted on page rows so a test can prove it is not a skip key. Never read. */
  lastEditedTime?: string | null;
};

export type BodyLoadResult = NotionBlock[] | "timeout" | "failed";

/**
 * Null recipe_blocks come first. lastEditedTime is intentionally unused:
 * an unchanged Notion timestamp must not skip a missing body.
 */
export function orderForRecipeBackfill<T extends { id: string }>(
  pages: readonly T[],
  stored: readonly RecipePresence[],
): T[] {
  const filled = new Set(
    stored
      .filter((row) => row.hasRecipe === true)
      .map((row) => normalizeNotionId(row.notionPageId)),
  );
  const missing: T[] = [];
  const ready: T[] = [];
  for (const page of pages) {
    if (filled.has(normalizeNotionId(page.id))) ready.push(page);
    else missing.push(page);
  }
  return [...missing, ...ready];
}

export async function syncRecipeBodies<T extends { id: string }>(input: {
  pages: readonly T[];
  stored: readonly RecipePresence[];
  budgetMs: number;
  now: () => number;
  loadBlocks: (id: string) => Promise<BodyLoadResult>;
  save: (page: T, blocks: NotionBlock[]) => Promise<void>;
  fail: (page: T) => Promise<void>;
  defer: (page: T) => Promise<void>;
}): Promise<{ partial: boolean; saved: string[]; deferred: string[] }> {
  const started = input.now();
  const saved: string[] = [];
  const deferred: string[] = [];
  let partial = false;

  for (const page of orderForRecipeBackfill(input.pages, input.stored)) {
    if (input.now() - started >= input.budgetMs) {
      partial = true;
      deferred.push(page.id);
      await input.defer(page);
      continue;
    }
    const loaded = await input.loadBlocks(page.id);
    if (loaded === "timeout") {
      partial = true;
      deferred.push(page.id);
      await input.defer(page);
      continue;
    }
    if (loaded === "failed") {
      await input.fail(page);
      continue;
    }
    await input.save(page, loaded);
    saved.push(page.id);
  }

  return { partial, saved, deferred };
}
