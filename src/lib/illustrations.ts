/** Bump when a replaced file should bypass a long-lived browser cache. */
export const ILLUSTRATION_VERSION = "1";

export const ILLUSTRATION_SIZES = [240, 480, 960] as const;

export type IllustrationSize = (typeof ILLUSTRATION_SIZES)[number];

/** Notion page id (32 hex chars, no dashes) → sizes that exist on disk. */
export type IllustrationManifest = Partial<
  Record<string, readonly IllustrationSize[]>
>;

export type DishIllustration = {
  src: string;
  srcSet: string;
  sizes: string;
  /** Smallest file that exists, for the week-board thumb. */
  thumb: string;
};

const FILE_NAME = /^([0-9a-f]{32})-(240|480|960)\.webp$/;

/**
 * Stable file key. Null when the dish has no Notion page (sample seeds)
 * or the id is not 32 hex characters.
 */
export function illustrationFileId(
  notionPageId: string | null | undefined,
): string | null {
  if (!notionPageId) return null;
  const hex = notionPageId.trim().toLowerCase().replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return hex;
}

/** Ids whose 240, 480, and 960 files are all present. Partial sets are omitted. */
export function manifestFromFilenames(
  names: readonly string[],
): IllustrationManifest {
  const found = new Map<string, Set<IllustrationSize>>();
  for (const name of names) {
    const match = FILE_NAME.exec(name);
    if (!match) continue;
    const id = match[1]!;
    const size = Number(match[2]) as IllustrationSize;
    const sizes = found.get(id) ?? new Set<IllustrationSize>();
    sizes.add(size);
    found.set(id, sizes);
  }

  const manifest: IllustrationManifest = {};
  for (const [id, sizes] of found) {
    if (!ILLUSTRATION_SIZES.every((size) => sizes.has(size))) continue;
    manifest[id] = [...ILLUSTRATION_SIZES];
  }
  return manifest;
}

export function serializeIllustrationManifest(
  manifest: IllustrationManifest,
): string {
  const ordered: IllustrationManifest = {};
  for (const id of Object.keys(manifest).sort()) {
    const sizes = manifest[id];
    if (!sizes || sizes.length === 0) continue;
    ordered[id] = [...sizes].sort((a, b) => a - b);
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/**
 * Card art at `public/illustrations/<notionPageId>-<240|480|960>.webp`.
 * `notionPageId` is 32 hex chars, no dashes. A missing id or a missing
 * manifest entry is null, so the card paints DishFallback and never
 * requests a file that was not present at build time.
 */
export function illustrationForNotionPage(
  notionPageId: string | null | undefined,
  manifest: IllustrationManifest,
): DishIllustration | null {
  const id = illustrationFileId(notionPageId);
  if (!id) return null;
  const sizes = manifest[id];
  if (!sizes || sizes.length === 0) return null;
  const present = ILLUSTRATION_SIZES.filter((size) => sizes.includes(size));
  if (present.length === 0) return null;
  const srcSize = present.includes(480) ? 480 : present[0]!;
  const url = (size: IllustrationSize) =>
    `/illustrations/${id}-${size}.webp?v=${ILLUSTRATION_VERSION}`;
  return {
    src: url(srcSize),
    srcSet: present.map((size) => `${url(size)} ${size}w`).join(", "),
    sizes: "(min-width: 2560px) 280px, (min-width: 1024px) 220px, 50vw",
    thumb: url(present[0]!),
  };
}
