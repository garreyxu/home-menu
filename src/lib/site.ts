export const siteName = "御膳房";
export const siteTagline = "建设中";

export function formatSiteHeading(
  name: string = siteName,
  tagline: string = siteTagline,
): string {
  return `${name} · ${tagline}`;
}
