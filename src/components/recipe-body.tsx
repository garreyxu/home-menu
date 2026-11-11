import { normalizeRecipeSpans, normalizeRecipeText } from "@/lib/recipe-text";
import type { ReactNode } from "react";
import type { RecipeBlock, RecipeSpan } from "@/lib/recipe-blocks";

const HEADING_LABELS = new Map([
  ["prep time", "准备时间"],
  ["cook time", "烹饪时间"],
  ["shopping list", "需要食材"],
  ["ingredients", "需要食材"],
  ["tips", "小贴士"],
  ["steps", "步骤"],
  ["instructions", "步骤"],
]);

function headingSpans(spans: RecipeSpan[]): RecipeSpan[] {
  const label = HEADING_LABELS.get(
    spans
      .map((span) => span.text)
      .join("")
      .trim()
      .toLowerCase(),
  );
  return label ? [{ text: label }] : spans;
}

export function RecipeBody({ blocks }: { blocks: readonly RecipeBlock[] }) {
  if (blocks.length === 0) {
    return (
      <div className="recipe-empty">
        <p className="recipe-empty-mark font-brush">待补</p>
        <p>这道菜还没写做法</p>
      </div>
    );
  }
  return (
    <div className="recipe-body">
      <RecipeSequence blocks={blocks} />
    </div>
  );
}

function RecipeSequence({ blocks }: { blocks: readonly RecipeBlock[] }) {
  return groupBlocks(blocks).map((group, index) => {
    if (group.kind === "bulleted" || group.kind === "numbered") {
      const List = group.kind === "bulleted" ? "ul" : "ol";
      return (
        <List key={index} className="recipe-list">
          {group.items.map((item, itemIndex) => (
            <li key={itemIndex}>
              <RecipeText spans={item.spans} />
              {item.children.length > 0 ? (
                <RecipeSequence blocks={item.children} />
              ) : null}
            </li>
          ))}
        </List>
      );
    }
    return <RecipeNode key={index} block={group.block} />;
  });
}

function RecipeNode({ block }: { block: RecipeBlock }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p>
          <RecipeText spans={block.spans} />
        </p>
      );
    case "heading": {
      const Heading =
        block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
      return (
        <Heading className="recipe-heading font-brush">
          <RecipeText spans={headingSpans(block.spans)} />
        </Heading>
      );
    }
    case "quote":
      return (
        <blockquote className="recipe-quote">
          <RecipeText spans={block.spans} />
        </blockquote>
      );
    case "callout":
      return (
        <aside className="recipe-callout">
          <RecipeText spans={block.spans} />
        </aside>
      );
    case "divider":
      return <hr className="recipe-divider" />;
    case "placeholder":
      if (block.label === "图片") return null;
      return (
        <p className="recipe-placeholder">{normalizeRecipeText(block.label)}</p>
      );
    case "bulleted_list_item":
    case "numbered_list_item":
    case "to_do":
      return null;
  }
}

function RecipeText({ spans }: { spans: readonly RecipeSpan[] }) {
  return normalizeRecipeSpans(spans).map((span, index) => {
    let node: ReactNode = span.text;
    if (span.italic) node = <em>{node}</em>;
    if (span.bold) node = <strong>{node}</strong>;
    return (
      <span key={index} className="recipe-text">
        {node}
      </span>
    );
  });
}

type ListItem = Extract<
  RecipeBlock,
  { type: "bulleted_list_item" | "numbered_list_item" | "to_do" }
>;

type RenderGroup =
  | { kind: "bulleted"; items: ListItem[] }
  | { kind: "numbered"; items: ListItem[] }
  | { kind: "block"; block: RecipeBlock };

function groupBlocks(blocks: readonly RecipeBlock[]): RenderGroup[] {
  const groups: RenderGroup[] = [];
  for (const block of blocks) {
    // Image URLs are deliberately absent from the normalized recipe payload.
    // Skip these blocks before grouping so they do not interrupt a list.
    if (block.type === "placeholder" && block.label === "图片") continue;
    if (
      block.type !== "bulleted_list_item" &&
      block.type !== "numbered_list_item" &&
      block.type !== "to_do"
    ) {
      groups.push({ kind: "block", block });
      continue;
    }
    const kind = block.type === "numbered_list_item" ? "numbered" : "bulleted";
    const last = groups[groups.length - 1];
    if (last && last.kind === kind) last.items.push(block);
    else groups.push({ kind, items: [block] });
  }
  return groups;
}
