export type RecipeSpan = {
  text: string;
  bold?: true;
  italic?: true;
};

export const RECIPE_PLACEHOLDER_LABELS = [
  "图片",
  "嵌入内容",
  "未支持的内容",
] as const;

export type RecipePlaceholderLabel = (typeof RECIPE_PLACEHOLDER_LABELS)[number];

export type RecipeBlock =
  | { type: "paragraph"; spans: RecipeSpan[] }
  | { type: "heading"; level: 1 | 2 | 3; spans: RecipeSpan[] }
  | {
      type: "bulleted_list_item";
      spans: RecipeSpan[];
      children: RecipeBlock[];
    }
  | {
      type: "numbered_list_item";
      spans: RecipeSpan[];
      children: RecipeBlock[];
    }
  | {
      type: "to_do";
      spans: RecipeSpan[];
      checked: boolean;
      children: RecipeBlock[];
    }
  | { type: "quote"; spans: RecipeSpan[] }
  | { type: "callout"; spans: RecipeSpan[] }
  | { type: "divider" }
  | { type: "placeholder"; label: RecipePlaceholderLabel };

const PLACEHOLDER_LABELS = new Set<string>(RECIPE_PLACEHOLDER_LABELS);
const MAX_BLOCKS = 400;

/**
 * Keep only the fields the recipe view renders.
 * Extra keys, links, and list nesting past one level are dropped.
 */
export function parseRecipeBlocks(value: unknown): RecipeBlock[] {
  return parseBlocks(value, 0).slice(0, MAX_BLOCKS);
}

function parseBlocks(value: unknown, depth: number): RecipeBlock[] {
  if (!Array.isArray(value) || depth > 1) return [];
  const blocks: RecipeBlock[] = [];
  for (const item of value) {
    const block = parseBlock(item, depth);
    if (block) blocks.push(block);
  }
  return blocks;
}

function parseBlock(value: unknown, depth: number): RecipeBlock | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  switch (record.type) {
    case "divider":
      return { type: "divider" };
    case "placeholder":
      if (
        typeof record.label === "string" &&
        PLACEHOLDER_LABELS.has(record.label)
      ) {
        return {
          type: "placeholder",
          label: record.label as RecipePlaceholderLabel,
        };
      }
      return null;
    case "heading": {
      const spans = parseSpans(record.spans);
      if (
        !spans ||
        (record.level !== 1 && record.level !== 2 && record.level !== 3)
      ) {
        return null;
      }
      return { type: "heading", level: record.level, spans };
    }
    case "paragraph":
    case "quote":
    case "callout": {
      const spans = parseSpans(record.spans);
      if (!spans) return null;
      return { type: record.type, spans };
    }
    case "bulleted_list_item":
    case "numbered_list_item":
    case "to_do": {
      const spans = parseSpans(record.spans);
      if (!spans) return null;
      const children = parseBlocks(record.children, depth + 1);
      if (record.type === "to_do") {
        return {
          type: "to_do",
          spans,
          checked: record.checked === true,
          children,
        };
      }
      return { type: record.type, spans, children };
    }
    default:
      return null;
  }
}

function parseSpans(value: unknown): RecipeSpan[] | null {
  if (!Array.isArray(value)) return null;
  const spans: RecipeSpan[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.text !== "string" || record.text.length === 0) continue;
    const span: RecipeSpan = { text: record.text };
    if (record.bold === true) span.bold = true;
    if (record.italic === true) span.italic = true;
    spans.push(span);
  }
  return spans;
}
