import type { RecipeBlock } from "@/lib/recipe-blocks";
import { normalizeNotionId } from "@/server/notion/ids";
import { normalizeRecipeBlocks } from "@/server/notion/recipe-blocks";
import {
  cleanDishName,
  displayText,
  multiNames,
  plainText,
} from "@/server/notion/text";
import type { NotionBlock, NotionProperty } from "@/server/notion/types";
import { isTriedPage } from "@/server/notion/map-page";

const MAX_TAG = 40;
const MAX_TAGS = 12;
const MAX_INGREDIENTS = 8000;
const MAX_SOURCE = 2000;

export type MappedDrink = {
  notionPageId: string;
  name: string;
  baseSpirits: string[];
  flavors: string[];
  ingredients: string | null;
  sourceUrl: string | null;
  tried: boolean;
  recipeBlocks: RecipeBlock[];
  hasBody: boolean;
};

export type DrinkMap =
  | { kind: "skip"; name: string | null; reason: string }
  | {
      kind: "drink";
      drink: MappedDrink;
      /** Download this, then drop it. It is not stored. */
      photoUrl: string | null;
      /** True when the body was not read. The previous steps stay. */
      preserveBody: boolean;
    };

export function mapDrinkPage(page: {
  id: string;
  properties: Record<string, NotionProperty>;
  blocks: NotionBlock[] | null;
}): DrinkMap {
  const name = cleanDishName(rawTitle(page.properties)) || null;
  if (!name) return { kind: "skip", name: null, reason: "酒名为空" };

  const blocks = page.blocks;
  const recipeBlocks = blocks ? normalizeRecipeBlocks(blocks) : [];
  return {
    kind: "drink",
    drink: {
      notionPageId: normalizeNotionId(page.id),
      name,
      baseSpirits: tags(page.properties["基酒"]),
      flavors: tags(page.properties["口味"]),
      ingredients: clip(displayText(page.properties["配料"]), MAX_INGREDIENTS),
      sourceUrl: drinkSourceUrl(page.properties["出处"]),
      tried: isTriedPage(page.properties),
      recipeBlocks,
      hasBody: recipeBlocks.length > 0,
    },
    photoUrl: drinkPhotoUrl(page.properties["照片"]),
    preserveBody: blocks === null,
  };
}

export function drinkSourceUrl(
  prop: NotionProperty | undefined,
): string | null {
  let raw = "";
  if (prop?.type === "url") raw = prop.url ?? "";
  else if (prop?.type === "rich_text") raw = plainText(prop.rich_text);
  else return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_SOURCE) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** First https file on 照片. The URL is for the sync download only. */
export function drinkPhotoUrl(prop: NotionProperty | undefined): string | null {
  if (!prop || prop.type !== "files" || !Array.isArray(prop.files)) return null;
  for (const file of prop.files) {
    const candidate = file?.file?.url ?? file?.external?.url;
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!/^https:\/\//i.test(trimmed)) continue;
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "https:" || url.username || url.password) continue;
      return url.toString();
    } catch {
      continue;
    }
  }
  return null;
}

function rawTitle(properties: Record<string, NotionProperty>): string {
  const titled =
    properties["酒名"]?.type === "title"
      ? properties["酒名"]
      : Object.values(properties).find((prop) => prop?.type === "title");
  return plainText(titled?.title);
}

function tags(prop: NotionProperty | undefined): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of multiNames(prop)) {
    const trimmed = name.trim().slice(0, MAX_TAG);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    names.push(trimmed);
    if (names.length >= MAX_TAGS) break;
  }
  return names;
}

function clip(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}
