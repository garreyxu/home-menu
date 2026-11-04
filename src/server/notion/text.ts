import type { NotionProperty, NotionRichText } from "@/server/notion/types";

export function plainText(value: NotionRichText[] | undefined): string {
  if (!value) return "";
  return value.map((item) => item.plain_text ?? "").join("");
}

/** Drop Notion `<br>` tags and surrounding whitespace. The page icon is not part of the title. */
export function cleanDishName(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

/** Same cleanup as an imported title, with inner whitespace folded, for matching seed rows. */
export function normalizeDishName(raw: string): string {
  return cleanDishName(raw).replace(/\s+/g, "");
}

export function displayText(prop: NotionProperty | undefined): string | null {
  if (!prop?.type) return null;
  let text = "";
  switch (prop.type) {
    case "title":
      text = plainText(prop.title);
      break;
    case "rich_text":
      text = plainText(prop.rich_text);
      break;
    case "select":
      text = prop.select?.name ?? "";
      break;
    case "status":
      text = prop.status?.name ?? "";
      break;
    case "multi_select":
      text = (prop.multi_select ?? [])
        .map((option) => option.name ?? "")
        .filter((name) => name.length > 0)
        .join("、");
      break;
    case "number":
      text = prop.number == null ? "" : String(prop.number);
      break;
    case "url":
      text = prop.url ?? "";
      break;
    case "checkbox":
      text = prop.checkbox ? "是" : "";
      break;
    case "formula":
      if (prop.formula?.type === "string") text = prop.formula.string ?? "";
      else if (prop.formula?.type === "number" && prop.formula.number != null) {
        text = String(prop.formula.number);
      }
      break;
    default:
      return null;
  }
  const cleaned = text.trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function multiNames(prop: NotionProperty | undefined): string[] {
  if (!prop) return [];
  if (prop.type === "multi_select") {
    return (prop.multi_select ?? [])
      .map((option) => option.name?.trim() ?? "")
      .filter((name) => name.length > 0);
  }
  const single = displayText(prop);
  return single ? [single] : [];
}
