import { classifyNotionPage } from "@/server/notion/map-page";
import { normalizeNotionId } from "@/server/notion/ids";
import {
  safeSyncError,
  type ImportReport,
  type NotionSkip,
} from "@/server/notion/report";
import type { NotionPageSnapshot, PhotoChoice } from "@/server/notion/types";
import type { PhotoStore } from "@/server/photos/store";

export type StoredNotionDish = {
  id: string;
  notionPageId: string;
  name: string;
  photoKey: string | null;
  photoSourceKey: string | null;
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
  tried: true;
  cuisines: string[];
  mainIngredient: string | null;
  body: { blocks: unknown[] };
  hasBody: boolean;
  photoKey: string | null;
  photoSourceKey: string | null;
};

export interface DishRepository {
  listNotionDishes(): Promise<StoredNotionDish[]>;
  /** Insert or overwrite by Notion page id. Does not delete the row. */
  upsert(dish: UpsertDish): Promise<"added" | "updated">;
  /**
   * Mark these Notion dishes inactive. Rows and weekly-menu links stay.
   * Dishes that were never imported are not created.
   */
  delist(notionPageIds: readonly string[]): Promise<number>;
  countOnWall(): Promise<{ onWall: number; onWallWithPhoto: number }>;
}

export async function importNotionCatalog(input: {
  loadPages: () => Promise<NotionPageSnapshot[]>;
  download: (
    url: string,
  ) => Promise<{ bytes: Uint8Array; contentType: string }>;
  photos: PhotoStore;
  dishes: DishRepository;
  storageConfigured: boolean;
}): Promise<ImportReport> {
  const pages = await input.loadPages();
  const existingRows = await input.dishes.listNotionDishes();
  const existingById = new Map(
    existingRows.map((row) => [normalizeNotionId(row.notionPageId), row]),
  );

  const keep = new Set<string>();
  const outcomes = new Map<string, "photo" | "placeholder">();
  const skipped: NotionSkip[] = [];
  const warnings: string[] = [];
  let notTried = 0;
  let added = 0;
  let updated = 0;
  let missedPhotos = 0;

  for (const page of pages) {
    const pageId = normalizeNotionId(page.id);
    const classified = classifyNotionPage(page);
    if (classified.kind === "not_tried") {
      notTried += 1;
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

    const mapped = classified.dish;
    keep.add(pageId);
    const existing = existingById.get(pageId);
    const photo = await resolvePhoto({
      name: mapped.name,
      notionPageId: mapped.notionPageId,
      choice: mapped.photo,
      existing,
      download: input.download,
      photos: input.photos,
      storageConfigured: input.storageConfigured,
      warnings,
      onMissedPhoto: () => {
        missedPhotos += 1;
      },
    });
    const result = await input.dishes.upsert({
      notionPageId: mapped.notionPageId,
      name: mapped.name,
      categoryName: mapped.categoryName,
      description: mapped.description,
      cookTime: mapped.cookTime,
      ingredients: mapped.ingredients,
      rating: mapped.rating,
      tried: true,
      cuisines: mapped.cuisines,
      mainIngredient: mapped.mainIngredient,
      body: mapped.body,
      hasBody: mapped.hasBody,
      photoKey: photo.photoKey,
      photoSourceKey: photo.photoSourceKey,
    });
    if (result === "added") added += 1;
    else updated += 1;
    outcomes.set(pageId, photo.photoKey ? "photo" : "placeholder");
    existingById.set(pageId, {
      id: existing?.id ?? pageId,
      notionPageId: pageId,
      name: mapped.name,
      photoKey: photo.photoKey,
      photoSourceKey: photo.photoSourceKey,
      isActive: true,
    });
  }

  if (missedPhotos > 0) {
    warnings.unshift(
      `有 ${missedPhotos} 道菜的照片没能转存，因为还没配置私有存储。菜已经导入，配置好之后再同步一次就会补上。`,
    );
  }

  const delistIds = [
    ...new Set(
      existingRows
        .map((row) => normalizeNotionId(row.notionPageId))
        .filter((id) => !keep.has(id)),
    ),
  ];
  const delisted = await input.dishes.delist(delistIds);
  const wall = await input.dishes.countOnWall();
  let withPhoto = 0;
  let placeholder = 0;
  for (const outcome of outcomes.values()) {
    if (outcome === "photo") withPhoto += 1;
    else placeholder += 1;
  }

  return {
    imported: outcomes.size,
    withPhoto,
    placeholder,
    added,
    updated,
    delisted,
    onWall: wall.onWall,
    onWallWithPhoto: wall.onWallWithPhoto,
    notTried,
    skipped: capSkips(skipped),
    warnings: capWarnings(warnings),
  };
}

async function resolvePhoto(input: {
  name: string;
  notionPageId: string;
  choice: PhotoChoice;
  existing: StoredNotionDish | undefined;
  download: (
    url: string,
  ) => Promise<{ bytes: Uint8Array; contentType: string }>;
  photos: PhotoStore;
  storageConfigured: boolean;
  warnings: string[];
  onMissedPhoto: () => void;
}): Promise<{ photoKey: string | null; photoSourceKey: string | null }> {
  let photoKey = input.existing?.photoKey ?? null;
  let photoSourceKey = input.existing?.photoSourceKey ?? null;

  if (input.choice.kind === "placeholder") {
    if (photoKey && input.storageConfigured) {
      await deleteQuietly(input.photos, photoKey, input.name, input.warnings);
    }
    return { photoKey: null, photoSourceKey: null };
  }

  if (photoKey && photoSourceKey === input.choice.sourceKey) {
    return { photoKey, photoSourceKey };
  }

  if (!input.storageConfigured) {
    input.onMissedPhoto();
    return { photoKey, photoSourceKey };
  }

  try {
    const file = await input.download(input.choice.url);
    const key = `dishes/${input.notionPageId}`;
    await input.photos.put(key, file.bytes, file.contentType);
    if (photoKey && photoKey !== key) {
      await deleteQuietly(input.photos, photoKey, input.name, input.warnings);
    }
    photoKey = key;
    photoSourceKey = input.choice.sourceKey;
  } catch (error) {
    input.warnings.push(
      `${input.name}：照片没能转存（${safeSyncError(error)}）`,
    );
  }

  return { photoKey, photoSourceKey };
}

async function deleteQuietly(
  photos: PhotoStore,
  key: string,
  name: string,
  warnings: string[],
): Promise<void> {
  try {
    await photos.delete(key);
  } catch {
    warnings.push(`${name}：旧照片没能删掉`);
  }
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
