import type { Locator } from "@playwright/test";

/**
 * Prefer a 步骤 or 烹煮 section when one introduces a numbered list.
 * Any other top-level numbered list still counts: the seal styling does not
 * depend on the heading text, and workstation recipes use other titles.
 */
export function stepHeadingRank(heading: string): number {
  const compact = heading.replace(/\s+/g, "");
  if (compact.includes("步骤")) return 0;
  if (compact.includes("烹煮")) return 1;
  return 2;
}

export async function revealNumberedSteps(
  dialog: Locator,
): Promise<{ list: Locator; headingInView: boolean } | null> {
  const lists = dialog.locator(".recipe-body > ol.recipe-list");
  const count = await lists.count();
  let best = -1;
  let bestRank = 3;
  for (let index = 0; index < count; index++) {
    const heading = await lists.nth(index).evaluate((list) => {
      let sibling = list.previousElementSibling;
      while (sibling) {
        if (/^H[3-5]$/.test(sibling.tagName)) return sibling.textContent ?? "";
        if (sibling.matches("ol, ul")) return "";
        sibling = sibling.previousElementSibling;
      }
      return "";
    });
    const rank = stepHeadingRank(heading);
    if (rank < bestRank) {
      best = index;
      bestRank = rank;
    }
    if (bestRank === 0) break;
  }
  if (best < 0) return null;
  const list = lists.nth(best);
  const headingInView = await list.evaluate((node) => {
    const scroll = node.closest(".recipe-scroll");
    if (!scroll) return false;
    let heading: Element | null = null;
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (/^H[3-5]$/.test(sibling.tagName)) {
        heading = sibling;
        break;
      }
      if (sibling.matches("ol, ul")) break;
      sibling = sibling.previousElementSibling;
    }
    const anchor = heading ?? node;
    scroll.scrollTop +=
      anchor.getBoundingClientRect().top -
      scroll.getBoundingClientRect().top -
      12;
    const item = node.querySelector(":scope > li");
    if (!item) return false;
    const style = getComputedStyle(item, "::before");
    const sealBottom =
      item.getBoundingClientRect().top +
      parseFloat(style.top) +
      parseFloat(style.height);
    const viewBottom = Math.min(
      scroll.getBoundingClientRect().bottom,
      window.innerHeight,
    );
    if (sealBottom > viewBottom - 1) {
      scroll.scrollTop +=
        item.getBoundingClientRect().top -
        scroll.getBoundingClientRect().top -
        12;
    }
    if (!heading) return false;
    const rect = heading.getBoundingClientRect();
    const area = scroll.getBoundingClientRect();
    return (
      rect.bottom > Math.max(area.top, 0) &&
      rect.top < Math.min(area.bottom, window.innerHeight)
    );
  });
  return { list, headingInView };
}
