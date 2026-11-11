import { test, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WeekBoard } from "@/components/week-board";

vi.mock("@/app/shopping-actions", () => ({
  loadShoppingList: vi.fn(),
  toggleShoppingCheck: vi.fn(),
  clearShoppingChecks: vi.fn(),
}));

// The original check used static markup without app styles or hydration.
for (const width of [1440, 390]) {
  for (const selecting of [false, true]) {
    test(`empty slots have full accessible names at ${width}px (selecting: ${selecting})`, () => {
      const html = renderToStaticMarkup(
        createElement(
          "div",
          { style: { width } },
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
      const tags = html.match(/<[^>]+>/g) ?? [];
      const name = `周一午餐，还没点菜${selecting ? "，点按加菜" : ""}`;
      const slots = tags.filter(
        (tag) =>
          (selecting
            ? tag.startsWith("<button ")
            : tag.includes('role="group"')) &&
          tag.includes(`aria-label="${name}"`),
      );
      expect(slots).toHaveLength(1);
      expect(slots[0]).toContain(`aria-label="${name}"`);
      expect(
        tags.filter(
          (tag) =>
            tag.startsWith("<button ") &&
            tag.includes('aria-label="从周二晚餐移除红烧肉"'),
        ),
      ).toHaveLength(1);
      const occupied = tags.filter((tag) =>
        tag.includes('data-slot="2:dinner"'),
      );
      expect(occupied).toHaveLength(1);
      expect(occupied[0]).not.toContain("aria-label=");
    });
  }
}
