import {
  NotionRequestError,
  type NotionListedPage,
} from "@/server/notion/client";
import {
  downloadDrinkPhoto,
  drinkPhotoFingerprint,
  type StoredDrinkPhoto,
} from "@/server/notion/drink-photo";
import { normalizeNotionId } from "@/server/notion/ids";
import { mapDrinkPage, type MappedDrink } from "@/server/notion/map-drink";
import type { NotionBlock } from "@/server/notion/types";

export const DRINKS_ACCESS_NOTE = "酒单：Notion 集成没有访问权限";
export const DRINKS_READ_FAILED = "酒单：没能读取，下次同步会再试。";

export type DrinkPhotoWrite =
  | { kind: "keep" }
  | { kind: "clear" }
  | { kind: "set"; photo: StoredDrinkPhoto };

export type StoredDrinkRow = {
  notionPageId: string;
  isActive: boolean;
  photoFingerprint: string | null;
};

export type DrinkUpsert = {
  drink: MappedDrink;
  photo: DrinkPhotoWrite;
  preserveBody: boolean;
};

export type DrinkRepository = {
  listStored(): Promise<StoredDrinkRow[]>;
  upsert(input: DrinkUpsert): Promise<"added" | "updated">;
  deactivate(notionPageIds: readonly string[]): Promise<number>;
};

export function isDrinksAccessFailure(error: unknown): boolean {
  if (!(error instanceof NotionRequestError)) return false;
  return (
    error.status === 403 ||
    error.status === 404 ||
    error.code === "object_not_found"
  );
}

export function formatDrinkNote(counts: {
  added: number;
  updated: number;
  inactivated: number;
  held: boolean;
}): string {
  if (counts.held) return "酒单：0 杯。已有的先留着，请检查 Notion。";
  const imported = counts.added + counts.updated;
  return `酒单：导入 ${imported} 杯，新增 ${counts.added}，更新 ${counts.updated}，下架 ${counts.inactivated}。`;
}

/**
 * Import cocktails after dishes. Access failures and empty databases do not
 * throw. An empty successful read with nothing stored is a normal zero.
 */
export async function syncDrinkCatalog(input: {
  list: () => Promise<NotionListedPage[]>;
  loadBlocks: (
    pageId: string,
    deadline: number,
  ) => Promise<
    | { status: "ok"; blocks: NotionBlock[] }
    | { status: "timeout" }
    | { status: "failed" }
  >;
  downloadPhoto?: typeof downloadDrinkPhoto;
  repo: DrinkRepository;
  deadline: number;
  now?: () => number;
}): Promise<string> {
  let pages: NotionListedPage[];
  try {
    pages = await input.list();
  } catch (error) {
    if (isDrinksAccessFailure(error)) return DRINKS_ACCESS_NOTE;
    return DRINKS_READ_FAILED;
  }

  const stored = await input.repo.listStored();
  const storedById = new Map(
    stored.map((row) => [row.notionPageId, row] as const),
  );
  if (pages.length === 0 && stored.some((row) => row.isActive)) {
    return formatDrinkNote({
      added: 0,
      updated: 0,
      inactivated: 0,
      held: true,
    });
  }

  const now = input.now ?? Date.now;
  const download = input.downloadPhoto ?? downloadDrinkPhoto;
  const keep = new Set<string>();
  let added = 0;
  let updated = 0;

  for (const page of pages) {
    const pageId = normalizeNotionId(page.id);
    keep.add(pageId);
    const pastDeadline = now() >= input.deadline;
    const loaded = pastDeadline
      ? { status: "timeout" as const }
      : await input.loadBlocks(page.id, input.deadline);
    const blocks = loaded.status === "ok" ? loaded.blocks : null;
    const mapped = mapDrinkPage({
      id: page.id,
      properties: page.properties,
      blocks,
    });
    if (mapped.kind === "skip") continue;

    const previous = storedById.get(mapped.drink.notionPageId);
    const photo = await choosePhoto({
      photoUrl: mapped.photoUrl,
      previous: previous?.photoFingerprint ?? null,
      download,
      skipDownload: pastDeadline,
    });
    const result = await input.repo.upsert({
      drink: mapped.drink,
      photo,
      preserveBody: mapped.preserveBody,
    });
    if (result === "added") added += 1;
    else updated += 1;
  }

  const missing = stored
    .filter((row) => row.isActive && !keep.has(row.notionPageId))
    .map((row) => row.notionPageId);
  const inactivated =
    missing.length === 0 ? 0 : await input.repo.deactivate(missing);
  return formatDrinkNote({ added, updated, inactivated, held: false });
}

async function choosePhoto(input: {
  photoUrl: string | null;
  previous: string | null;
  download: typeof downloadDrinkPhoto;
  skipDownload: boolean;
}): Promise<DrinkPhotoWrite> {
  if (!input.photoUrl) return { kind: "clear" };
  const fingerprint = drinkPhotoFingerprint(input.photoUrl);
  if (!fingerprint) return { kind: "clear" };
  if (input.previous === fingerprint) return { kind: "keep" };
  if (input.skipDownload) return { kind: "keep" };
  const downloaded = await input.download(input.photoUrl);
  if (!downloaded) return { kind: "keep" };
  return { kind: "set", photo: { ...downloaded, fingerprint } };
}

export function keepDrinkNote(
  warnings: readonly string[],
  note: string,
): string[] {
  const next = [...warnings, note];
  if (next.length <= 20) return next;
  return [...next.slice(0, 19), note];
}
