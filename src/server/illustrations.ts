import "server-only";

import manifest from "@/generated/illustrations.json";
import {
  illustrationForNotionPage,
  type DishIllustration,
  type IllustrationManifest,
} from "@/lib/illustrations";

const catalog = manifest as IllustrationManifest;

/** Illustration for a stored Notion page id, using the build-time manifest. */
export function illustrationForPage(
  notionPageId: string | null | undefined,
): DishIllustration | null {
  return illustrationForNotionPage(notionPageId, catalog);
}
