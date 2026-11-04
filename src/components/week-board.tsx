"use client";

import { useState } from "react";
import {
  DAY_LABELS,
  MEAL_FULL,
  MEAL_SHORT,
  type WeekMenuItemView,
} from "@/lib/menu-slots";
import { categoryFilterHref } from "@/lib/category-filter";
import { frameLetter } from "@/lib/frames";
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
  thumbs = {},
  onRemove,
}: {
  weekStart: string;
  currentWeekStart: string;
  todayIso: string;
  items: readonly WeekMenuItemView[];
  categoryParam: string | null;
  thumbs?: Record<string, string | undefined>;
  onRemove: (item: WeekMenuItemView) => void;
}) {
  const previous = categoryFilterHref(categoryParam, shiftWeek(weekStart, -1));
  const next = categoryFilterHref(categoryParam, shiftWeek(weekStart, 1));
  const current = categoryFilterHref(categoryParam, null);
  const letter = frameLetter(weekStart);

  return (
    <div className={cn("frame-panel p-3", `frame-panel-${letter}`)}>
      <div className="week-board-head">
        <div className="week-board-nav">
          <a
            className="week-nav-link frame-tag frame-tag-a focus-ring"
            href={previous}
          >
            上一周
          </a>
          <a
            className="week-nav-link frame-tag frame-tag-b focus-ring"
            href={current}
            aria-current={weekStart === currentWeekStart ? "date" : undefined}
          >
            本周
          </a>
          <a
            className="week-nav-link frame-tag frame-tag-c focus-ring"
            href={next}
          >
            下一周
          </a>
        </div>
        <p className="text-sm text-sumi-soft">{formatWeekRange(weekStart)}</p>
      </div>
      {items.length === 0 ? (
        <div className="week-empty">
          <svg
            className="week-empty-enso"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            <path
              d="M50 16c16 1 28 8 32 20 4 12 1 24-8 34-10 11-24 16-38 15-16-1-28-10-34-22-6-13-3-28 8-38 9-8 22-10 40-9z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
          <p className="section-title font-brush text-sumi">这周还没点菜</p>
          <a href="#dish-wall-heading" className="stamp-button focus-ring">
            去菜单挑挑
          </a>
        </div>
      ) : null}
      <div className="week-board-body">
        <div className="week-day week-day-head" aria-hidden="true">
          <span />
          {MEALS.map((meal) => (
            <span key={meal} className="font-brush">
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
              <div className="week-day-label font-brush">
                {isToday ? <span className="sr-only">今天，</span> : null}
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
                  thumbs={thumbs}
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

function WeekThumb({ src }: { src: string }) {
  return (
    // Static illustration file. Not a remote photo.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="week-thumb" src={src} alt="" width={32} height={32} />
  );
}

function Slot({
  day,
  meal,
  items,
  thumbs,
  onRemove,
}: {
  day: number;
  meal: Meal;
  items: readonly WeekMenuItemView[];
  thumbs: Record<string, string | undefined>;
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
        {shown.map((item) => {
          const thumb = thumbs[item.dishId];
          return (
            <li key={item.id} className="week-slot-item">
              {thumb ? <WeekThumb src={thumb} /> : null}
              <span
                className="week-dish-name"
                title={item.dishName}
                aria-label={item.dishName}
              >
                {item.dishName}
              </span>
              <button
                type="button"
                className="week-remove frame-tag frame-tag-a focus-ring"
                aria-label={`从${dayLabel}${mealName}移除${item.dishName}`}
                onClick={() => onRemove(item)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      {extra > 0 ? (
        <button
          type="button"
          className="week-more frame-tag frame-tag-b focus-ring text-sm font-bold"
          onClick={() => setExpanded(true)}
        >
          +{extra}
        </button>
      ) : null}
    </div>
  );
}
