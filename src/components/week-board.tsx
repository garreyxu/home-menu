"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
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
const LONG_PRESS_MS = 350;
const LONG_PRESS_TOLERANCE = 8;

/** Title copy in the touch menu. Lunch is 午, matching the board's 中 column. */
const PRESS_MEAL: Record<Meal, string> = {
  breakfast: "早",
  lunch: "午",
  dinner: "晚",
};

type PressTarget = {
  item: WeekMenuItemView;
  day: number;
  meal: Meal;
};

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
  const [pressed, setPressed] = useState<PressTarget | null>(null);
  const closeMenu = useCallback(() => setPressed(null), []);

  return (
    <div className={cn("frame-panel week-board", `frame-panel-${letter}`)}>
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
        <p className="week-board-range">
          {formatWeekRange(weekStart)} · 已点 {items.length} 道
        </p>
      </div>
      <button type="button" className="week-custom focus-ring">
        ＋ 自定义（外卖、聚餐…）
      </button>
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
                  onLongPress={(item) => setPressed({ item, day, meal })}
                />
              ))}
            </div>
          );
        })}
      </div>
      {pressed ? (
        <PressMenu
          target={pressed}
          thumb={thumbs[pressed.item.dishId]}
          onRemove={() => {
            const item = pressed.item;
            setPressed(null);
            onRemove(item);
          }}
          onClose={closeMenu}
        />
      ) : null}
    </div>
  );
}

function WeekThumb({ src, size }: { src: string; size: number }) {
  return (
    // Static illustration file. Not a remote photo.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="week-thumb" src={src} alt="" width={size} height={size} />
  );
}

function Slot({
  day,
  meal,
  items,
  thumbs,
  onRemove,
  onLongPress,
}: {
  day: number;
  meal: Meal;
  items: readonly WeekMenuItemView[];
  thumbs: Record<string, string | undefined>;
  onRemove: (item: WeekMenuItemView) => void;
  onLongPress: (item: WeekMenuItemView) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, VISIBLE_DISHES);
  const extra = items.length - shown.length;
  const mealName = MEAL_FULL[meal];
  const dayLabel = DAY_LABELS[day] ?? "";

  if (items.length === 0) {
    return (
      <div className="week-slot week-slot-empty">
        <span aria-hidden="true">＋</span>
        <span className="sr-only">空</span>
      </div>
    );
  }

  return (
    <div className="week-slot">
      <ul className="week-slot-list">
        {shown.map((item) => {
          const thumb = thumbs[item.dishId];
          return (
            <Chip
              key={item.id}
              item={item}
              thumb={thumb}
              dayLabel={dayLabel}
              mealName={mealName}
              onRemove={onRemove}
              onLongPress={() => onLongPress(item)}
            />
          );
        })}
      </ul>
      {extra > 0 ? (
        <button
          type="button"
          className="week-more focus-ring"
          onClick={() => setExpanded(true)}
        >
          +{extra}
        </button>
      ) : null}
    </div>
  );
}

function Chip({
  item,
  thumb,
  dayLabel,
  mealName,
  onRemove,
  onLongPress,
}: {
  item: WeekMenuItemView;
  thumb: string | undefined;
  dayLabel: string;
  mealName: string;
  onRemove: (item: WeekMenuItemView) => void;
  onLongPress: () => void;
}) {
  const press = useLongPress(onLongPress);

  return (
    <li className="week-chip" {...press}>
      {thumb ? <WeekThumb src={thumb} size={24} /> : null}
      <span
        className="week-dish-name"
        title={item.dishName}
        aria-label={item.dishName}
      >
        {item.dishName}
      </span>
      <button
        type="button"
        className="week-remove focus-ring"
        aria-label={`从${dayLabel}${mealName}移除${item.dishName}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => onRemove(item)}
      >
        ×
      </button>
    </li>
  );
}

function useLongPress(onLongPress: () => void) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);
  const onPress = useRef(onLongPress);

  useEffect(() => {
    onPress.current = onLongPress;
  }, [onLongPress]);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  function clearTimer() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }

  function reset() {
    clearTimer();
    held.current = false;
    origin.current = null;
  }

  return {
    onPointerDown(event: ReactPointerEvent<HTMLLIElement>) {
      if (event.pointerType === "mouse" || event.button !== 0) return;
      held.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      clearTimer();
      timer.current = window.setTimeout(() => {
        timer.current = null;
        held.current = true;
      }, LONG_PRESS_MS);
    },
    onPointerMove(event: ReactPointerEvent<HTMLLIElement>) {
      if (!origin.current) return;
      const dx = event.clientX - origin.current.x;
      const dy = event.clientY - origin.current.y;
      if (dx * dx + dy * dy > LONG_PRESS_TOLERANCE * LONG_PRESS_TOLERANCE) {
        reset();
      }
    },
    onPointerUp() {
      const shouldOpen = held.current;
      reset();
      if (shouldOpen) onPress.current();
    },
    onPointerCancel: reset,
    onContextMenu(event: SyntheticEvent) {
      event.preventDefault();
    },
  };
}

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function PressMenu({
  target,
  thumb,
  onRemove,
  onClose,
}: {
  target: PressTarget;
  thumb: string | undefined;
  onRemove: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const isClient = useIsClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dayLabel = DAY_LABELS[target.day] ?? "";

  useEffect(() => {
    if (!isClient) return;
    const previous = document.activeElement;
    sheetRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [isClient, onClose]);

  if (!isClient) return null;

  return createPortal(
    <div className="week-press-layer">
      <button
        type="button"
        className="week-press-backdrop"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="week-press-sheet"
      >
        <div id={titleId} className="week-press-title">
          {thumb ? <WeekThumb src={thumb} size={40} /> : null}
          <span>
            {target.item.dishName} · {dayLabel}
            {PRESS_MEAL[target.meal]}
          </span>
        </div>
        <button
          type="button"
          className="week-press-action week-press-delete focus-ring"
          onClick={onRemove}
        >
          从这顿删掉
        </button>
        <button
          type="button"
          className="week-press-action week-press-cancel focus-ring"
          onClick={onClose}
        >
          取消
        </button>
      </div>
    </div>,
    document.body,
  );
}
