import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WeekBoard } from "@/components/week-board";
import type { WeekMenuItemView } from "@/lib/menu-slots";

const weekStart = "2026-11-08";

function item(
  id: string,
  dayOfWeek: number,
  meal: WeekMenuItemView["meal"],
  dishName: string,
): WeekMenuItemView {
  return { id, dayOfWeek, meal, dishId: id, dishName };
}

function render(items: WeekMenuItemView[], thumbs?: Record<string, string>) {
  return renderToStaticMarkup(
    createElement(WeekBoard, {
      weekStart,
      currentWeekStart: weekStart,
      todayIso: "2026-11-09",
      items,
      categoryParam: null,
      thumbs,
      onCustom: () => {},
      onRemove: () => {},
    }),
  );
}

describe("WeekBoard", () => {
  it("shows the range, the count, and a Noto chip with a round thumb", () => {
    const html = render([item("egg", 1, "breakfast", "番茄炒蛋")], {
      egg: "/illustrations/egg-thumb.webp",
    });

    expect(html).toContain("11月8日–11月14日 · 已点 1 道");
    expect(html).toContain("＋ 自定义（外卖、聚餐…）");
    expect(html).toContain('class="week-chip"');
    expect(html).toMatch(/<li[^>]*role="listitem"[^>]*class="week-chip"/);
    expect(html).toContain('class="week-dish-name"');
    expect(html).not.toContain("week-dish-name font-brush");
    expect(html).toContain('title="番茄炒蛋"');
    expect(html).toContain('aria-label="番茄炒蛋"');
    expect(html).toContain('class="week-thumb illus-blend-thumb"');
    expect(html).not.toContain("week-thumb-fallback");
    expect(html).toContain('width="24"');
    expect(html).toContain('height="24"');
    expect(html).toContain('aria-label="从周一早餐移除番茄炒蛋"');
    expect(html).toContain("今天，");
    expect(html).toContain(">＋<");
    expect(html).not.toContain("空着呢");
  });

  it("keeps three chips and a +N plate", () => {
    const html = render([
      item("a", 2, "dinner", "红烧肉"),
      item("b", 2, "dinner", "米饭"),
      item("c", 2, "dinner", "清炒西兰花"),
      item("d", 2, "dinner", "拍黄瓜"),
      item("e", 2, "dinner", "馒头"),
    ]);

    expect(html).toContain("已点 5 道");
    expect(html.match(/class="week-chip"/g)).toHaveLength(3);
    expect(html).toContain("+2");
    expect(html).not.toContain("拍黄瓜");
    expect(html).not.toContain("馒头");
  });

  it("paints the dish initial when a chip has no thumbnail", () => {
    const html = render([item("squid", 3, "dinner", "香辣鱿鱼面")]);
    const mark = html.match(
      /class="week-thumb week-thumb-fallback font-brush"[^>]*>([^<]*)</,
    );

    expect(mark?.[1]?.trim()).toBe("香");
    expect(html).not.toContain("<img");
  });
});
