import type { RecipeBlock, RecipeSpan } from "@/lib/recipe-blocks";
import type { NotionBlock, NotionRichText } from "@/server/notion/types";

const EMBED_TYPES = new Set([
  "embed",
  "video",
  "file",
  "pdf",
  "audio",
  "bookmark",
  "link_preview",
  "link_to_page",
]);

const CONTAINER_TYPES = new Set([
  "toggle",
  "column_list",
  "column",
  "synced_block",
  "template",
]);

/**
 * Turn a Notion block tree into the small structure stored on a dish.
 * List items keep one level of children. Images and embeds become placeholders.
 * Links are not stored.
 */
export function normalizeRecipeBlocks(
  blocks: readonly NotionBlock[],
): RecipeBlock[] {
  return convertBlocks(blocks, 0);
}

function convertBlocks(
  blocks: readonly NotionBlock[],
  depth: number,
): RecipeBlock[] {
  return blocks.flatMap((block) => convertBlock(block, depth));
}

function convertBlock(block: NotionBlock, depth: number): RecipeBlock[] {
  if (block.type === "column_list") {
    return (block.children ?? []).flatMap((column) => {
      if (column.type === "column") {
        return convertBlocks(column.children ?? [], depth);
      }
      return convertBlock(column, depth);
    });
  }

  if (CONTAINER_TYPES.has(block.type)) {
    const title = spansOf(block);
    const children = convertBlocks(block.children ?? [], depth);
    if (title.length === 0) return children;
    return [{ type: "paragraph", spans: title }, ...children];
  }

  if (block.type === "image") return [{ type: "placeholder", label: "图片" }];
  if (EMBED_TYPES.has(block.type)) {
    return [{ type: "placeholder", label: "嵌入内容" }];
  }
  if (block.type === "divider") return [{ type: "divider" }];

  const spans = spansOf(block);
  const nested =
    depth < 1 ? convertBlocks(block.children ?? [], depth + 1) : [];

  switch (block.type) {
    case "paragraph":
      return spans.length > 0
        ? [{ type: "paragraph", spans }, ...nested]
        : nested;
    case "heading_1":
    case "heading_2":
    case "heading_3": {
      const level = headingLevel(block.type);
      const heading: RecipeBlock[] =
        spans.length > 0 ? [{ type: "heading", level, spans }] : [];
      return [...heading, ...nested];
    }
    case "bulleted_list_item":
    case "numbered_list_item":
      if (spans.length === 0 && nested.length === 0) return [];
      return [{ type: block.type, spans, children: nested }];
    case "to_do":
      if (spans.length === 0 && nested.length === 0) return [];
      return [
        {
          type: "to_do",
          spans,
          checked: block.to_do?.checked === true,
          children: nested,
        },
      ];
    case "quote":
      return spans.length > 0 ? [{ type: "quote", spans }, ...nested] : nested;
    case "callout":
      return spans.length > 0
        ? [{ type: "callout", spans }, ...nested]
        : nested;
    default:
      if (nested.length > 0) return nested;
      return [{ type: "placeholder", label: "未支持的内容" }];
  }
}

function headingLevel(type: string): 1 | 2 | 3 {
  if (type === "heading_1") return 1;
  if (type === "heading_2") return 2;
  return 3;
}

function spansOf(block: NotionBlock): RecipeSpan[] {
  const record = block as unknown as Record<
    string,
    { rich_text?: NotionRichText[] } | undefined
  >;
  const payload = record[block.type];
  if (!payload || typeof payload !== "object" || !payload.rich_text) return [];
  const spans: RecipeSpan[] = [];
  for (const item of payload.rich_text) {
    const text = item.plain_text ?? "";
    if (!text) continue;
    const span: RecipeSpan = { text };
    if (item.annotations?.bold) span.bold = true;
    if (item.annotations?.italic) span.italic = true;
    spans.push(span);
  }
  return spans;
}
