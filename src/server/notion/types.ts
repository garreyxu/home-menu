export type NotionRichText = { plain_text?: string };

export type NotionProperty = {
  type?: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  select?: { name?: string } | null;
  multi_select?: { name?: string }[] | null;
  checkbox?: boolean;
  number?: number | null;
  status?: { name?: string } | null;
  url?: string | null;
  formula?: {
    type?: string;
    string?: string | null;
    number?: number | null;
  } | null;
};

export type NotionFile = {
  type?: string;
  file?: { url?: string };
  external?: { url?: string };
};

export type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  children?: NotionBlock[];
  image?: NotionFile;
  paragraph?: { rich_text?: NotionRichText[] };
  heading_1?: { rich_text?: NotionRichText[] };
  heading_2?: { rich_text?: NotionRichText[] };
  heading_3?: { rich_text?: NotionRichText[] };
  bulleted_list_item?: { rich_text?: NotionRichText[] };
  numbered_list_item?: { rich_text?: NotionRichText[] };
  to_do?: { rich_text?: NotionRichText[]; checked?: boolean };
  toggle?: { rich_text?: NotionRichText[] };
  quote?: { rich_text?: NotionRichText[] };
  callout?: { rich_text?: NotionRichText[] };
};

export type NotionPageSnapshot = {
  id: string;
  properties: Record<string, NotionProperty>;
  cover: NotionFile | null;
  /** Null when the body could not be read. Empty array means a blank page. */
  blocks: NotionBlock[] | null;
  blocksError?: string;
};

export type DishBodyBlock =
  | { type: "paragraph"; text: string; children: DishBodyBlock[] }
  | {
      type: "heading";
      level: 1 | 2 | 3;
      text: string;
      children: DishBodyBlock[];
    }
  | { type: "bulleted_list_item"; text: string; children: DishBodyBlock[] }
  | { type: "numbered_list_item"; text: string; children: DishBodyBlock[] }
  | {
      type: "to_do";
      text: string;
      checked: boolean;
      children: DishBodyBlock[];
    }
  | { type: "toggle"; text: string; children: DishBodyBlock[] }
  | { type: "column_list"; columns: DishBodyBlock[][] }
  | { type: "quote"; text: string; children: DishBodyBlock[] }
  | { type: "callout"; text: string; children: DishBodyBlock[] }
  | { type: "divider" }
  | { type: "image" }
  | {
      type: "other";
      blockType: string;
      text: string;
      children: DishBodyBlock[];
    };

export type DishBody = { blocks: DishBodyBlock[] };

export const TRIED_PROPERTY_NAME = "已尝试?";
export const UNCATEGORIZED = "未分类";
