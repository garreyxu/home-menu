import type { NotionBlock, NotionProperty } from "@/server/notion/types";
import { displayText } from "@/server/notion/text";

/**
 * Text that does not count as a cooking step.
 * Matching is case, whitespace, and punctuation insensitive: the value is
 * compared after NFKC, lowercasing, and stripping whitespace and punctuation.
 * "-" and "..." normalize to empty, which is also not a step.
 */
export const STEP_PLACEHOLDERS = [
  "待补充",
  "待写",
  "TODO",
  "TBD",
  "暂无",
  "无",
  "-",
  "...",
] as const;

const PLACEHOLDER_KEYS = new Set(
  STEP_PLACEHOLDERS.map((item) => normalizeStepText(item)).filter(
    (item) => item.length > 0,
  ),
);

/** Empty, punctuation-only, or one of STEP_PLACEHOLDERS. */
export function isPlaceholderStepText(value: string): boolean {
  const normalized = normalizeStepText(value);
  if (!normalized) return true;
  return PLACEHOLDER_KEYS.has(normalized);
}

export function isMeaningfulStepText(value: string): boolean {
  return !isPlaceholderStepText(value);
}

/**
 * A recipe has steps when:
 * - it uses a steps heading, toggle, or property (name is or ends with 步骤 / 做法),
 *   and that section or property contains at least one real paragraph, list item,
 *   to-do, quote, or callout; or
 * - it does not use that structure, and the body has at least one real paragraph,
 *   list item, or to-do.
 * Images, dividers, and headings do not count. Placeholder-only text does not count.
 * Ingredient fields are not steps.
 */
export function pageHasSteps(page: {
  properties: Record<string, NotionProperty>;
  blocks: readonly NotionBlock[] | null;
}): boolean {
  if (!page.blocks) return false;
  const sections = collectStepSections(page.blocks);
  const property = stepsPropertyTexts(page.properties);
  if (sections.used || property.used) {
    return [...sections.texts, ...property.texts].some((text) =>
      isMeaningfulStepText(text),
    );
  }
  return hasFallbackStep(page.blocks);
}

function normalizeStepText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function isStepsLabel(value: string): boolean {
  const normalized = value.normalize("NFKC").replace(/[\s\p{P}\p{S}]+/gu, "");
  if (!normalized) return false;
  return (
    normalized === "步骤" ||
    normalized === "做法" ||
    normalized.endsWith("步骤") ||
    normalized.endsWith("做法")
  );
}

function blockPlainText(block: NotionBlock): string {
  const record = block as unknown as Record<
    string,
    { rich_text?: { plain_text?: string }[] } | undefined
  >;
  const payload = record[block.type];
  if (!payload || typeof payload !== "object" || !payload.rich_text) return "";
  return payload.rich_text
    .map((item) => item.plain_text ?? "")
    .join("")
    .trim();
}

function headingLevel(block: NotionBlock): number | null {
  if (block.type === "heading_1") return 1;
  if (block.type === "heading_2") return 2;
  if (block.type === "heading_3") return 3;
  return null;
}

const SECTION_TEXT_TYPES = new Set([
  "paragraph",
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
  "quote",
  "callout",
]);

const FALLBACK_TEXT_TYPES = new Set([
  "paragraph",
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
]);

function collectStepSections(blocks: readonly NotionBlock[]): {
  used: boolean;
  texts: string[];
} {
  let used = false;
  const texts: string[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block) continue;
    const level = headingLevel(block);
    const label = blockPlainText(block);

    if (level !== null && isStepsLabel(label)) {
      used = true;
      const section: NotionBlock[] = [...(block.children ?? [])];
      let next = index + 1;
      for (; next < blocks.length; next += 1) {
        const sibling = blocks[next];
        if (!sibling) break;
        const siblingLevel = headingLevel(sibling);
        if (siblingLevel !== null && siblingLevel <= level) break;
        section.push(sibling);
      }
      collectTexts(section, SECTION_TEXT_TYPES, texts);
      index = next - 1;
      continue;
    }

    if (block.type === "toggle" && isStepsLabel(label)) {
      used = true;
      collectTexts(block.children ?? [], SECTION_TEXT_TYPES, texts);
      continue;
    }

    if (block.children && block.children.length > 0 && isContainer(block)) {
      const nested = collectStepSections(block.children);
      if (nested.used) {
        used = true;
        texts.push(...nested.texts);
      }
    }
  }

  return { used, texts };
}

function isContainer(block: NotionBlock): boolean {
  return (
    block.type === "column_list" ||
    block.type === "column" ||
    block.type === "toggle" ||
    block.type === "callout" ||
    block.type === "quote" ||
    block.type === "synced_block"
  );
}

function collectTexts(
  blocks: readonly NotionBlock[],
  types: ReadonlySet<string>,
  into: string[],
): void {
  for (const block of blocks) {
    if (types.has(block.type)) {
      const text = blockPlainText(block);
      if (text) into.push(text);
    }
    if (block.children && block.children.length > 0) {
      collectTexts(block.children, types, into);
    }
  }
}

function hasFallbackStep(blocks: readonly NotionBlock[]): boolean {
  for (const block of blocks) {
    if (
      FALLBACK_TEXT_TYPES.has(block.type) &&
      isMeaningfulStepText(blockPlainText(block))
    ) {
      return true;
    }
    if (
      block.children &&
      block.children.length > 0 &&
      hasFallbackStep(block.children)
    ) {
      return true;
    }
  }
  return false;
}

function stepsPropertyTexts(properties: Record<string, NotionProperty>): {
  used: boolean;
  texts: string[];
} {
  const texts: string[] = [];
  let used = false;
  for (const [name, prop] of Object.entries(properties)) {
    if (!isStepsLabel(name)) continue;
    const value = displayText(prop);
    if (!value) continue;
    const lines = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) continue;
    used = true;
    texts.push(...lines);
  }
  return { used, texts };
}
