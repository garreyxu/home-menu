import { blocksToBody } from "@/server/notion/body";
import { normalizeNotionId } from "@/server/notion/ids";
import { pageHasSteps } from "@/server/notion/steps";
import {
  cleanDishName,
  displayText,
  multiNames,
  plainText,
} from "@/server/notion/text";
import {
  TRIED_PROPERTY_NAME,
  UNCATEGORIZED,
  type DishBody,
  type NotionPageSnapshot,
  type NotionProperty,
} from "@/server/notion/types";

export type MappedDish = {
  notionPageId: string;
  name: string;
  categoryName: string;
  cookTime: string | null;
  ingredients: string | null;
  rating: string | null;
  tried: boolean;
  cuisines: string[];
  mainIngredient: string | null;
  body: DishBody;
  hasBody: boolean;
  description: string | null;
};

export type PageClass =
  | { kind: "skip"; name: string | null; reason: string }
  | { kind: "errored"; name: string | null }
  | { kind: "no_steps"; name: string }
  | { kind: "dish"; dish: MappedDish };

export function isTriedPage(
  properties: Record<string, NotionProperty>,
): boolean {
  const prop = properties[TRIED_PROPERTY_NAME];
  return prop?.type === "checkbox" && prop.checkbox === true;
}

export function assertTriedProperty(
  properties: Record<string, { type?: string }>,
): void {
  const prop = properties[TRIED_PROPERTY_NAME];
  if (!prop) {
    throw new Error(
      "Notion 数据源里找不到「已尝试?」。已停止同步，没有改菜单。",
    );
  }
  if (prop.type !== "checkbox") {
    throw new Error("「已尝试?」不是勾选框。已停止同步，没有改菜单。");
  }
}

function titleProperty(
  properties: Record<string, NotionProperty>,
): NotionProperty | undefined {
  if (properties["菜名"]?.type === "title") return properties["菜名"];
  return Object.values(properties).find((prop) => prop?.type === "title");
}

function rawName(properties: Record<string, NotionProperty>): string {
  return plainText(titleProperty(properties)?.title);
}

/**
 * Every page with real cooking steps is a dish. 「已尝试?」 is stored, not a filter.
 * A page whose body or properties could not be read is unknown: it is not
 * updated, inactivated, or deleted. A page with no steps is not imported.
 */
export function classifyNotionPage(page: NotionPageSnapshot): PageClass {
  const notionPageId = normalizeNotionId(page.id);
  const name = cleanDishName(rawName(page.properties)) || null;

  if (page.fetchError || page.blocksError || page.blocks === null) {
    return { kind: "errored", name };
  }
  if (!name) {
    return { kind: "skip", name: null, reason: "菜名为空" };
  }

  const prop = page.properties[TRIED_PROPERTY_NAME];
  if (prop && prop.type !== "checkbox") {
    return { kind: "skip", name, reason: "「已尝试?」不是勾选框" };
  }
  if (!pageHasSteps(page)) {
    return { kind: "no_steps", name };
  }

  const category = displayText(page.properties["类型"]) ?? UNCATEGORIZED;
  const body = blocksToBody(page.blocks);
  return {
    kind: "dish",
    dish: {
      notionPageId,
      name,
      categoryName: category,
      cookTime: displayText(page.properties["料理时间"]),
      ingredients: displayText(page.properties["需要食材"]),
      rating: displayText(page.properties["评分"]),
      tried: isTriedPage(page.properties),
      cuisines: multiNames(page.properties["菜系"]),
      mainIngredient: displayText(page.properties["主要食材种类"]),
      body,
      hasBody: true,
      // Card notes come only from a structured property, never the page body.
      description: null,
    },
  };
}
