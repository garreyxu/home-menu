import type { Locator, Page } from "@playwright/test";

// Match a meal slot with or without the accessible status suffix.
export function slotButton(scope: Locator | Page, slotName: string): Locator {
  const escaped = slotName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return scope.getByRole("button", { name: new RegExp(`^${escaped}(，|$)`) });
}
