import type { ReactNode } from "react";
import type { RecipeBlock, RecipeSpan } from "@/lib/recipe-blocks";

export function RecipeBody({ blocks }: { blocks: readonly RecipeBlock[] }) {
  if (blocks.length === 0) {
    return <p className="recipe-empty">暂无做法</p>;
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
        <Heading className="recipe-heading">
          <RecipeText spans={block.spans} />
        </Heading>
      );
    }
    case "to_do":
      return (
        <div className="recipe-todo">
          <span
            className="recipe-check"
            role="checkbox"
            aria-checked={block.checked}
            aria-disabled="true"
          >
            {block.checked ? "✓" : ""}
          </span>
          <div>
            <RecipeText spans={block.spans} />
            {block.children.length > 0 ? (
              <RecipeSequence blocks={block.children} />
            ) : null}
          </div>
        </div>
      );
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
      return <p className="recipe-placeholder">{block.label}</p>;
    case "bulleted_list_item":
    case "numbered_list_item":
      return null;
  }
}

function RecipeText({ spans }: { spans: readonly RecipeSpan[] }) {
  return spans.map((span, index) => {
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
  { type: "bulleted_list_item" | "numbered_list_item" }
>;

type RenderGroup =
  | { kind: "bulleted"; items: ListItem[] }
  | { kind: "numbered"; items: ListItem[] }
  | { kind: "block"; block: RecipeBlock };

function groupBlocks(blocks: readonly RecipeBlock[]): RenderGroup[] {
  const groups: RenderGroup[] = [];
  for (const block of blocks) {
    if (
      block.type !== "bulleted_list_item" &&
      block.type !== "numbered_list_item"
    ) {
      groups.push({ kind: "block", block });
      continue;
    }
    const kind = block.type === "bulleted_list_item" ? "bulleted" : "numbered";
    const last = groups[groups.length - 1];
    if (last && last.kind === kind) last.items.push(block);
    else groups.push({ kind, items: [block] });
  }
  return groups;
}
