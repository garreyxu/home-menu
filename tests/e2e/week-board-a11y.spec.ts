import { test, expect } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WeekBoard } from "../../src/components/week-board";

// Exercise the shared board without authentication or database fixtures.
for (const width of [1440, 390]) {
  for (const selecting of [false, true]) {
    test(`empty slots have full accessible names at ${width}px (selecting: ${selecting})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(
        renderToStaticMarkup(
          createElement(WeekBoard, {
            weekStart: "2026-11-08",
            currentWeekStart: "2026-11-08",
            todayIso: "2026-11-09",
            items: [
              {
                id: "dish",
                dishId: "dish",
                dishName: "红烧肉",
                dayOfWeek: 2,
                meal: "dinner",
              },
            ],
            categoryParam: null,
            onCustom: () => {},
            onRemove: () => {},
            interactive: true,
            selectingDish: selecting ? { id: "new", name: "米饭" } : undefined,
            onSelect: () => {},
          }),
        ),
      );
      const name = `周一午餐，还没点菜${selecting ? "，点按加菜" : ""}`;
      const slot = page.getByRole(selecting ? "button" : "group", {
        name,
        exact: true,
      });
      await expect(slot).toHaveCount(1);
      await expect(slot).toHaveAttribute("aria-label", name);
      await expect(
        page.getByRole("button", { name: "从周二晚餐移除红烧肉", exact: true }),
      ).toHaveCount(1);
      await expect(page.locator('[data-slot="2:dinner"]')).not.toHaveAttribute(
        "aria-label",
      );
    });
  }
}
