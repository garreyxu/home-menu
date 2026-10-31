export const siteName = "家庭菜单";
export const siteTagline = "建设中";

export function formatSiteHeading(
  name: string = siteName,
  tagline: string = siteTagline,
): string {
  return `${name} · ${tagline}`;
}
