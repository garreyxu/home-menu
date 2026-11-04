import fs from "node:fs";
import path from "node:path";

/** Bump when a replaced file should bypass a long-lived browser cache. */
export const ILLUSTRATION_VERSION = "1";

export const ILLUSTRATION_SIZES = [240, 480, 960] as const;

export type IllustrationSize = (typeof ILLUSTRATION_SIZES)[number];

export type DishIllustration = {
  src: string;
  srcSet: string;
  sizes: string;
  /** Smallest file that exists, for the week-board thumb. */
  thumb: string;
};

export function isSafeIllustrationId(dishId: string): boolean {
  return (
    dishId.length > 0 &&
    dishId.length <= 200 &&
    !dishId.includes("/") &&
    !dishId.includes("\\") &&
    !dishId.includes("..")
  );
}

/**
 * Card art at `public/illustrations/<dishId>-<240|480|960>.webp`.
 * Missing files resolve to null so the card can paint DishFallback
 * without requesting a 404.
 */
export function illustrationForDish(
  dishId: string,
  exists: (publicRelativePath: string) => boolean,
): DishIllustration | null {
  if (!isSafeIllustrationId(dishId)) return null;
  const present = ILLUSTRATION_SIZES.filter((size) =>
    exists(`illustrations/${dishId}-${size}.webp`),
  );
  if (present.length === 0) return null;
  const encoded = encodeURIComponent(dishId);
  const srcSize = present.includes(480) ? 480 : present[0];
  const url = (size: IllustrationSize) =>
    `/illustrations/${encoded}-${size}.webp?v=${ILLUSTRATION_VERSION}`;
  return {
    src: url(srcSize),
    srcSet: present.map((size) => `${url(size)} ${size}w`).join(", "),
    sizes: "(min-width: 2560px) 280px, (min-width: 1024px) 220px, 50vw",
    thumb: url(present[0]),
  };
}

export function publicFileExists(publicRelativePath: string): boolean {
  const root = path.resolve(process.cwd(), "public");
  const file = path.resolve(root, publicRelativePath);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return false;
  return fs.existsSync(file);
}
