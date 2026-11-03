import type {
  DishBody,
  DishBodyBlock,
  NotionBlock,
  NotionRichText,
} from "@/server/notion/types";
import { plainText } from "@/server/notion/text";

function richTextOf(block: NotionBlock): string {
  const record = block as unknown as Record<
    string,
    { rich_text?: NotionRichText[] } | undefined
  >;
  const payload = record[block.type];
  if (!payload || typeof payload !== "object" || !payload.rich_text) return "";
  return plainText(payload.rich_text).trim();
}

function childBlocks(block: NotionBlock): DishBodyBlock[] {
  return (block.children ?? []).flatMap(convertBlock);
}

function convertBlock(block: NotionBlock): DishBodyBlock[] {
  const text = richTextOf(block);
  const children = childBlocks(block);

  switch (block.type) {
    case "paragraph":
      return [{ type: "paragraph", text, children }];
    case "heading_1":
      return [{ type: "heading", level: 1, text, children }];
    case "heading_2":
      return [{ type: "heading", level: 2, text, children }];
    case "heading_3":
      return [{ type: "heading", level: 3, text, children }];
    case "bulleted_list_item":
      return [{ type: "bulleted_list_item", text, children }];
    case "numbered_list_item":
      return [{ type: "numbered_list_item", text, children }];
    case "to_do":
      return [
        {
          type: "to_do",
          text,
          checked: block.to_do?.checked === true,
          children,
        },
      ];
    case "toggle":
      return [{ type: "toggle", text, children }];
    case "quote":
      return [{ type: "quote", text, children }];
    case "callout":
      return [{ type: "callout", text, children }];
    case "divider":
      return [{ type: "divider" }];
    case "image":
      return [{ type: "image" }];
    case "column_list": {
      const columns = (block.children ?? [])
        .filter((child) => child.type === "column")
        .map((column) => (column.children ?? []).flatMap(convertBlock));
      return [{ type: "column_list", columns }];
    }
    case "column":
      return children;
    default:
      return [{ type: "other", blockType: block.type, text, children }];
  }
}

export function blocksToBody(blocks: readonly NotionBlock[]): DishBody {
  return { blocks: blocks.flatMap(convertBlock) };
}

function collectText(blocks: readonly DishBodyBlock[], into: string[]): void {
  for (const block of blocks) {
    switch (block.type) {
      case "divider":
      case "image":
        break;
      case "column_list":
        for (const column of block.columns) collectText(column, into);
        break;
      default:
        if (block.text) into.push(block.text);
        collectText(block.children, into);
    }
  }
}

export function bodyExcerpt(body: DishBody): string | null {
  const parts: string[] = [];
  collectText(body.blocks, parts);
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > 280 ? `${text.slice(0, 280)}…` : text;
}
