import { blocksToBody, bodyExcerpt } from "@/server/notion/body";
import { normalizeNotionId } from "@/server/notion/ids";
import { selectPhoto } from "@/server/notion/photo";
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
  type PhotoChoice,
} from "@/server/notion/types";

export type MappedDish = {
  notionPageId: string;
  name: string;
  categoryName: string;
  cookTime: string | null;
  ingredients: string | null;
  rating: string | null;
  tried: true;
  cuisines: string[];
  mainIngredient: string | null;
  body: DishBody;
  hasBody: boolean;
  description: string | null;
  photo: PhotoChoice;
};

export type PageClass =
  | { kind: "not_tried" }
  | { kind: "skip"; name: string | null; reason: string }
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
 * Only a checked 「已尝试?」 becomes a dish. Anything else is left out.
 * A tried page whose body failed to load is skipped, not delisted.
 */
export function classifyNotionPage(page: NotionPageSnapshot): PageClass {
  const notionPageId = normalizeNotionId(page.id);
  const prop = page.properties[TRIED_PROPERTY_NAME];
  if (!prop || prop.type !== "checkbox" || prop.checkbox !== true) {
    if (prop && prop.type !== "checkbox") {
      return {
        kind: "skip",
        name: cleanDishName(rawName(page.properties)) || null,
        reason: "「已尝试?」不是勾选框",
      };
    }
    return { kind: "not_tried" };
  }

  const name = cleanDishName(rawName(page.properties));
  if (!name) {
    return { kind: "skip", name: null, reason: "菜名为空" };
  }
  if (page.blocksError || page.blocks === null) {
    return { kind: "skip", name, reason: page.blocksError ?? "正文读取失败" };
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
      tried: true,
      cuisines: multiNames(page.properties["菜系"]),
      mainIngredient: displayText(page.properties["主要食材种类"]),
      body,
      hasBody: page.blocks.length > 0,
      description: bodyExcerpt(body),
      photo: selectPhoto(page.blocks, page.cover),
    },
  };
}
