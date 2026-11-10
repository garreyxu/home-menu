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
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  useDndContext,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { moveDuplicate } from "@/lib/move-item";
import { SlotDialog, SlotTable } from "@/components/add-to-day";
import { createPortal } from "react-dom";
import {
  DAY_LABELS,
  MEAL_FULL,
  MEAL_SHORT,
  slotLabel,
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
  onCustom,
  selectingDish,
  onSelect,
  onCancel,
  flash,
  onMove,
  onToast,
  interactive = false,
}: {
  onMove?: (item: WeekMenuItemView, day: number, meal: Meal) => void;
  onToast?: (text: string) => void;
  interactive?: boolean;
  selectingDish?: { id: string; name: string };
  onSelect?: (day: number, meal: Meal) => void;
  onCancel?: () => void;
  flash?: string | null;
  weekStart: string;
  currentWeekStart: string;
  todayIso: string;
  items: readonly WeekMenuItemView[];
  categoryParam: string | null;
  thumbs?: Record<string, string | undefined>;
  onCustom: (anchor: HTMLElement, item: WeekMenuItemView | null) => void;
  onRemove: (item: WeekMenuItemView) => void;
}) {
  const [dragged, setDragged] = useState<WeekMenuItemView | null>(null);
  const [moving, setMoving] = useState<WeekMenuItemView | null>(null);
  const [destination, setDestination] = useState<{
    day: number;
    meal: Meal;
  } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 350, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: cellKeyboardCoordinates }),
  );
  const boardRef = useRef<HTMLDivElement>(null);
  const previous = categoryFilterHref(categoryParam, shiftWeek(weekStart, -1));
  const next = categoryFilterHref(categoryParam, shiftWeek(weekStart, 1));
  const current = categoryFilterHref(categoryParam, null);
  const letter = frameLetter(weekStart);
  const [pressed, setPressed] = useState<PressTarget | null>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const selectingDishId = selectingDish?.id;
  useEffect(() => {
    if (selectingDishId) hintRef.current?.focus();
  }, [selectingDishId]);
  const closeMenu = useCallback(() => setPressed(null), []);

  return (
    <DndContext
      id={useId()}
      sensors={sensors}
      autoScroll={{ threshold: { x: 0.1, y: 0.1 } }}
      onDragStart={({ active }) =>
        setDragged(items.find((i) => i.id === active.id) ?? null)
      }
      onDragCancel={() => setDragged(null)}
      onDragEnd={({ over, activatorEvent }) => {
        if (dragged && over) {
          const { day, meal } = over.data.current as {
            day: number;
            meal: Meal;
          };
          if (moveDuplicate(items, dragged, day, meal))
            onToast?.("这顿已经有了");
          else onMove?.(dragged, day, meal);
        }
        if (dragged && activatorEvent instanceof KeyboardEvent) {
          const id = dragged.id;
          requestAnimationFrame(() =>
            boardRef.current
              ?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`)
              ?.focus(),
          );
        }
        setDragged(null);
      }}
      accessibility={{
        announcements: {
          onDragStart: () => "已拿起，方向键选择餐次，空格放下，Esc取消",
          onDragOver: ({ over }) =>
            over
              ? `移到${slotLabel(over.data.current?.day, over.data.current?.meal)}`
              : "",
          onDragEnd: ({ over }) =>
            over && dragged
              ? moveDuplicate(
                  items,
                  dragged,
                  over.data.current?.day,
                  over.data.current?.meal,
                )
                ? "这顿已经有了"
                : `已移到${slotLabel(over.data.current?.day, over.data.current?.meal)}`
              : "已取消",
          onDragCancel: () => "已取消",
        },
      }}
    >
      <div
        ref={boardRef}
        className={cn("frame-panel week-board", `frame-panel-${letter}`)}
      >
        {selectingDish ? (
          <div
            ref={hintRef}
            tabIndex={-1}
            className="slot-hint focus-ring"
            role="status"
          >
            <span>把『{selectingDish.name}』放到哪一顿？</span>
            <button type="button" className="focus-ring" onClick={onCancel}>
              取消
            </button>
          </div>
        ) : null}
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
        <button
          type="button"
          className="week-custom focus-ring"
          onClick={(e) => onCustom(e.currentTarget, null)}
        >
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
                    interactive={interactive && !selectingDish}
                    dragged={dragged}
                    allItems={items}
                    day={day}
                    meal={meal}
                    items={items.filter(
                      (item) => item.dayOfWeek === day && item.meal === meal,
                    )}
                    thumbs={thumbs}
                    selectingDish={selectingDish}
                    onSelect={onSelect}
                    flash={flash}
                    onCustom={onCustom}
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
            thumb={thumbs[pressed.item.dishId ?? ""]}
            onRemove={() => {
              const item = pressed.item;
              setPressed(null);
              onRemove(item);
            }}
            onMove={() => {
              setMoving(pressed.item);
              setDestination(null);
              setPressed(null);
            }}
            onRename={(anchor) => {
              onCustom(anchor, pressed.item);
              setPressed(null);
            }}
            onClose={closeMenu}
          />
        ) : null}
      </div>
      <DragOverlay>
        {dragged ? (
          <div className="move-overlay">
            {dragged.customName ? (
              <span className="custom-seal font-brush">外</span>
            ) : (
              <WeekMark
                name={dragged.dishName}
                src={thumbs[dragged.dishId ?? ""]}
                size={30}
              />
            )}
            {dragged.dishName}
          </div>
        ) : null}
      </DragOverlay>
      {moving ? (
        <SlotDialog
          title={`把『${moving.dishName}』移到哪一顿？`}
          anchor={null}
          onClose={() => setMoving(null)}
        >
          <SlotTable
            items={items}
            confirmText="✓ 移到这"
            selected={(day, meal) =>
              destination?.day === day && destination.meal === meal
            }
            disabled={(day, meal) =>
              (moving.dayOfWeek === day && moving.meal === meal) ||
              moveDuplicate(items, moving, day, meal)
            }
            cellNote={(day, meal) =>
              moving.dayOfWeek === day && moving.meal === meal
                ? "现在在这"
                : moveDuplicate(items, moving, day, meal)
                  ? "这顿已经有了"
                  : undefined
            }
            onPick={(day, meal) => setDestination({ day, meal })}
          />
          <button
            className="slot-add focus-ring"
            disabled={!destination}
            onClick={() => {
              if (destination)
                onMove?.(moving, destination.day, destination.meal);
              setMoving(null);
            }}
          >
            移过去
          </button>
        </SlotDialog>
      ) : null}
    </DndContext>
  );
}

const cellKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context, currentCoordinates },
) => {
  const delta: Record<string, [number, number]> = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  };
  if (!delta[event.code]) return;
  event.preventDefault();
  const current = context.over?.data.current ?? context.active?.data.current;
  if (!current) return currentCoordinates;
  const [d, m] = delta[event.code];
  const day = Math.max(0, Math.min(6, current.day + d));
  const meal = MEALS[Math.max(0, Math.min(2, MEALS.indexOf(current.meal) + m))];
  const cell = context.droppableContainers.get(`cell:${day}:${meal}`);
  const rect = cell?.rect.current;
  return rect
    ? {
        x: rect.left + rect.width / 2 - (context.collisionRect?.width ?? 0) / 2,
        y:
          rect.top + rect.height / 2 - (context.collisionRect?.height ?? 0) / 2,
      }
    : currentCoordinates;
};

function dishInitial(name: string): string {
  return Array.from(name.trim())[0] ?? "菜";
}

function WeekThumb({ src, size }: { src: string; size: number }) {
  return (
    // Static illustration file. Not a remote photo.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="week-thumb" src={src} alt="" width={size} height={size} />
  );
}

function WeekMark({
  name,
  src,
  size,
}: {
  name: string;
  src: string | undefined;
  size: number;
}) {
  if (src) return <WeekThumb src={src} size={size} />;
  return (
    <span
      className="week-thumb week-thumb-fallback font-brush"
      aria-hidden="true"
    >
      {dishInitial(name)}
    </span>
  );
}

function Slot({
  interactive,
  dragged,
  allItems,
  day,
  meal,
  items,
  thumbs,
  onRemove,
  onLongPress,
  onCustom,
  selectingDish,
  onSelect,
  flash,
}: {
  interactive: boolean;
  dragged: WeekMenuItemView | null;
  allItems: readonly WeekMenuItemView[];
  selectingDish?: { id: string; name: string };
  onSelect?: (day: number, meal: Meal) => void;
  flash?: string | null;
  day: number;
  meal: Meal;
  items: readonly WeekMenuItemView[];
  thumbs: Record<string, string | undefined>;
  onRemove: (item: WeekMenuItemView) => void;
  onCustom: (anchor: HTMLElement, item: WeekMenuItemView | null) => void;
  onLongPress: (item: WeekMenuItemView) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell:${day}:${meal}`,
    disabled: !interactive,
    data: { day, meal },
  });
  const duplicate = dragged
    ? moveDuplicate(allItems, dragged, day, meal)
    : false;
  const [expanded, setExpanded] = useState(false);
  const flashingItem = items.find(
    (item) => flash === `${item.dishId}:${day}:${meal}`,
  );
  const shown = expanded
    ? items
    : flashingItem
      ? [
          ...items
            .filter((item) => item !== flashingItem)
            .slice(0, VISIBLE_DISHES - 1),
          flashingItem,
        ]
      : items.slice(0, VISIBLE_DISHES);
  const extra = items.length - shown.length;
  const mealName = MEAL_FULL[meal];
  const dayLabel = DAY_LABELS[day] ?? "";

  const disabled = items.some((item) => item.dishId === selectingDish?.id);
  return (
    <div
      ref={setNodeRef}
      data-slot={`${day}:${meal}`}
      className={cn(
        isOver && "move-hover",
        isOver && duplicate && "move-duplicate",
        "week-slot",
        !items.length && "week-slot-empty",
        selectingDish && "is-selecting",
        disabled && "is-disabled",
      )}
    >
      {isOver && dragged ? (
        <span className="move-hint">
          <span>{duplicate ? "这顿已经有了" : "放这里"}</span>
        </span>
      ) : null}
      {selectingDish ? (
        <button
          type="button"
          className="slot-target focus-ring"
          aria-label={`${slotLabel(day, meal)}${disabled ? "，这顿已经有了" : ""}`}
          aria-disabled={disabled}
          onClick={() => {
            if (!disabled) onSelect?.(day, meal);
          }}
        >
          {disabled ? (
            <span className="slot-duplicate">这顿已经有了</span>
          ) : null}
        </button>
      ) : null}
      {!items.length ? (
        <>
          <span aria-hidden="true">＋</span>
          <span className="sr-only">空</span>
        </>
      ) : null}
      <ul className="week-slot-list">
        {shown.map((item) => {
          const thumb = thumbs[item.dishId ?? ""];
          return (
            <Chip
              key={item.id}
              interactive={interactive}
              item={item}
              flash={flash === `${item.dishId}:${day}:${meal}`}
              thumb={thumb}
              dayLabel={dayLabel}
              mealName={mealName}
              onCustom={onCustom}
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
  interactive,
  item,
  thumb,
  flash,
  dayLabel,
  mealName,
  onRemove,
  onLongPress,
  onCustom,
}: {
  interactive: boolean;
  item: WeekMenuItemView;
  flash?: boolean;
  thumb: string | undefined;
  dayLabel: string;
  mealName: string;
  onRemove: (item: WeekMenuItemView) => void;
  onCustom: (anchor: HTMLElement, item: WeekMenuItemView | null) => void;
  onLongPress: () => void;
}) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: item.id,
    disabled: !interactive || item.id.startsWith("pending:"),
    data: { day: item.dayOfWeek, meal: item.meal },
  });
  const { active } = useDndContext();
  const moved = useRef(false);
  const press = useLongPress(() => {
    if (!moved.current) onLongPress();
  });

  return (
    <li
      ref={setNodeRef}
      data-item-id={item.id}
      {...attributes}
      {...listeners}
      style={
        isDragging
          ? { opacity: 0.3, border: "1px dashed var(--color-shu)" }
          : undefined
      }
      onPointerDown={(e) => {
        moved.current = false;
        press.onPointerDown(e);
        if (e.pointerType === "mouse") listeners?.onPointerDown?.(e);
      }}
      onPointerMove={(e) => {
        press.onPointerMove(e);
        if (active) moved.current = true;
      }}
      onPointerUp={press.onPointerUp}
      onPointerCancel={press.onPointerCancel}
      onContextMenu={press.onContextMenu}
      onClickCapture={(e) => {
        if (press.wasHeld()) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className={cn(
        "week-chip",
        flash && "slot-flash",
        item.customName && "week-custom-chip",
      )}
    >
      {item.customName ? (
        <button
          type="button"
          className="custom-chip-edit focus-ring"
          title={item.customName}
          aria-label={`编辑${item.customName}`}
          onClick={(e) => onCustom(e.currentTarget, item)}
        >
          <span className="custom-seal font-brush">外</span>
          <span className="week-dish-name" title={item.customName}>
            {item.customName}
          </span>
        </button>
      ) : (
        <WeekMark name={item.dishName} src={thumb} size={24} />
      )}
      {!item.customName ? (
        <span
          className="week-dish-name"
          title={item.dishName}
          aria-label={item.dishName}
        >
          {item.dishName}
        </span>
      ) : null}
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

  const suppressClick = useRef(false);
  return {
    wasHeld: () => suppressClick.current,
    onPointerDown(event: ReactPointerEvent<HTMLLIElement>) {
      suppressClick.current = false;
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
      if (shouldOpen) {
        suppressClick.current = true;
        onPress.current();
      }
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
  onMove,
  onRename,
}: {
  onMove: () => void;
  onRename: (anchor: HTMLElement) => void;
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
          {target.item.customName ? (
            <span className="custom-seal font-brush">外</span>
          ) : (
            <WeekMark name={target.item.dishName} src={thumb} size={40} />
          )}
          <span>
            {target.item.dishName} · {dayLabel}
            {PRESS_MEAL[target.meal]}
          </span>
        </div>
        <button
          type="button"
          className="week-press-action focus-ring"
          onClick={onMove}
        >
          移到…
        </button>
        {target.item.customName ? (
          <button
            type="button"
            className="week-press-action focus-ring"
            onClick={(e) => onRename(e.currentTarget)}
          >
            改名
          </button>
        ) : null}
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
