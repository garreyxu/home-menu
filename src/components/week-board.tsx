"use client";

import { useState } from "react";
import {
  DAY_LABELS,
  MEAL_FULL,
  MEAL_SHORT,
  type WeekMenuItemView,
} from "@/lib/menu-slots";
import { categoryFilterHref } from "@/lib/category-filter";
import { cn } from "@/lib/utils";
import { MEALS, type Meal } from "@/server/meals";
import { addCalendarDays, formatWeekRange, shiftWeek } from "@/server/week";

const VISIBLE_DISHES = 3;

export function WeekBoard({
  weekStart,
  currentWeekStart,
  todayIso,
  items,
  categoryParam,
  onRemove,
}: {
  weekStart: string;
  currentWeekStart: string;
  todayIso: string;
  items: readonly WeekMenuItemView[];
  categoryParam: string | null;
  onRemove: (item: WeekMenuItemView) => void;
}) {
  const previous = categoryFilterHref(categoryParam, shiftWeek(weekStart, -1));
  const next = categoryFilterHref(categoryParam, shiftWeek(weekStart, 1));
  const current = categoryFilterHref(categoryParam, null);

  return (
    <div className="week-board">
      <div className="week-board-head">
        <div className="week-board-nav">
          <a className="week-nav-link pixel-focus" href={previous}>
            上一周
          </a>
          <a
            className="week-nav-link pixel-focus"
            href={current}
            aria-current={weekStart === currentWeekStart ? "date" : undefined}
          >
            本周
          </a>
          <a className="week-nav-link pixel-focus" href={next}>
            下一周
          </a>
        </div>
        <p className="text-sm text-white">{formatWeekRange(weekStart)}</p>
      </div>
      <div className="week-board-body">
        {items.length === 0 ? (
          <p className="text-sm text-ink">这周还没点菜，去菜单挑挑吧</p>
        ) : null}
        <div className="week-day week-day-head" aria-hidden="true">
          <span />
          {MEALS.map((meal) => (
            <span key={meal} className="font-pixel pixel-type text-pixel-1">
              {MEAL_SHORT[meal]}
            </span>
          ))}
        </div>
        {DAY_LABELS.map((label, day) => {
          const isToday = addCalendarDays(weekStart, day) === todayIso;
          return (
            <div
              key={label}
              className="week-day"
              data-today={isToday ? "true" : undefined}
            >
              <div className="week-day-label font-pixel pixel-type text-pixel-1">
                {label}
              </div>
              {MEALS.map((meal) => (
                <Slot
                  key={meal}
                  day={day}
                  meal={meal}
                  items={items.filter(
                    (item) => item.dayOfWeek === day && item.meal === meal,
                  )}
                  onRemove={onRemove}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Slot({
  day,
  meal,
  items,
  onRemove,
}: {
  day: number;
  meal: Meal;
  items: readonly WeekMenuItemView[];
  onRemove: (item: WeekMenuItemView) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, VISIBLE_DISHES);
  const extra = items.length - shown.length;
  const mealName = MEAL_FULL[meal];
  const dayLabel = DAY_LABELS[day] ?? "";

  if (items.length === 0) {
    return (
      <div className="week-slot week-slot-empty">
        <span>空着呢</span>
      </div>
    );
  }

  return (
    <div className="week-slot">
      <ul className="week-slot-list">
        {shown.map((item) => (
          <li key={item.id} className="week-slot-item">
            <span className="week-thumb" aria-hidden="true">
              {Array.from(item.dishName)[0] ?? "菜"}
            </span>
            <span
              className="week-dish-name"
              title={item.dishName}
              aria-label={item.dishName}
            >
              {item.dishName}
            </span>
            <button
              type="button"
              className="week-remove pixel-focus"
              aria-label={`从${dayLabel}${mealName}移除${item.dishName}`}
              onClick={() => onRemove(item)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {extra > 0 ? (
        <button
          type="button"
          className={cn(
            "week-more pixel-focus",
            "font-pixel pixel-type text-pixel-1",
          )}
          onClick={() => setExpanded(true)}
        >
          +{extra}
        </button>
      ) : null}
    </div>
  );
}
