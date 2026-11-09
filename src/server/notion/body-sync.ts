import { normalizeNotionId } from "@/server/notion/ids";
import type { NotionBlock } from "@/server/notion/types";

/**
 * Fluid compute allows 300s. Stop with time left to flush a batch and mark the run.
 * Dishes still missing recipe_blocks are first in line on the next sync.
 */
export const SYNC_BUDGET_MS = 240_000;

/** Notion allows about 3 requests per second. The shared slotter keeps that cap. */
export const BODY_FETCH_CONCURRENCY = 3;

export const UPSERT_BATCH_SIZE = 20;

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
  concurrency?: number;
  batchSize?: number;
  loadBlocks: (id: string) => Promise<BodyLoadResult>;
  saveBatch: (
    items: readonly { page: T; blocks: NotionBlock[] }[],
  ) => Promise<void>;
  fail: (page: T) => Promise<void>;
  defer: (page: T) => Promise<void>;
}): Promise<{ partial: boolean; saved: string[]; deferred: string[] }> {
  const started = input.now();
  const ordered = orderForRecipeBackfill(input.pages, input.stored);
  const concurrency = Math.max(
    1,
    Math.min(input.concurrency ?? BODY_FETCH_CONCURRENCY, ordered.length || 1),
  );
  const batchSize = Math.max(1, input.batchSize ?? UPSERT_BATCH_SIZE);
  const saved: string[] = [];
  const deferred: string[] = [];
  const buffer: { page: T; blocks: NotionBlock[] }[] = [];
  let partial = false;
  let next = 0;
  let chain: Promise<void> = Promise.resolve();

  async function flush(force: boolean): Promise<void> {
    const take = force ? buffer.length : batchSize;
    if (take === 0 || (!force && buffer.length < batchSize)) return;
    const items = buffer.splice(0, take);
    const run = chain.then(() => input.saveBatch(items));
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    await run;
  }

  async function worker(): Promise<void> {
    while (true) {
      if (input.now() - started >= input.budgetMs) {
        partial = true;
        return;
      }
      const index = next;
      next += 1;
      if (index >= ordered.length) return;
      const page = ordered[index];
      if (!page) return;
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
      buffer.push({ page, blocks: loaded });
      saved.push(page.id);
      if (buffer.length >= batchSize) await flush(false);
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker()),
  );

  for (let index = next; index < ordered.length; index += 1) {
    const page = ordered[index];
    if (!page) continue;
    partial = true;
    deferred.push(page.id);
    await input.defer(page);
  }

  await flush(true);
  return { partial, saved, deferred };
}
