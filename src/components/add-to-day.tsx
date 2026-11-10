"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { StampButton } from "@/components/stamp-button";
import {
  DAY_LABELS,
  MEAL_SHORT,
  slotLabel,
  type WeekMenuItemView,
} from "@/lib/menu-slots";
import { cn } from "@/lib/utils";
import { MEALS, type Meal } from "@/server/meals";

/** Shared §4/§5 7×3 slot table. */
export function SlotTable({
  selected,
  onPick,
  items,
  disabled = () => false,
  cellNote,
  confirmText = "✓ 加这顿",
}: {
  selected: (day: number, meal: Meal) => boolean;
  onPick: (day: number, meal: Meal) => void;
  items: readonly WeekMenuItemView[];
  disabled?: (day: number, meal: Meal) => boolean;
  cellNote?: (day: number, meal: Meal) => string | undefined;
  confirmText?: string;
}) {
  return (
    <div className="add-day-grid">
      <span />
      {MEALS.map((meal) => (
        <span key={meal} className="add-day-heading text-center">
          {MEAL_SHORT[meal]}
        </span>
      ))}
      {DAY_LABELS.map((label, day) => (
        <div key={label} className="contents">
          <span className="add-day-heading self-center">{label}</span>
          {MEALS.map((meal) => (
            <button
              key={meal}
              type="button"
              className={cn(
                "add-day-cell focus-ring",
                selected(day, meal) && "is-selected",
                cellNote?.(day, meal) === "现在在这" && "is-current",
              )}
              disabled={disabled(day, meal)}
              aria-pressed={selected(day, meal)}
              aria-label={slotLabel(day, meal)}
              onClick={() => onPick(day, meal)}
            >
              <span className="slot-dishes">
                {items
                  .filter((i) => i.dayOfWeek === day && i.meal === meal)
                  .map((i) => i.customName ?? i.dishName)
                  .join("、") || "空"}
              </span>
              {cellNote?.(day, meal) ? (
                <span className="slot-confirm">{cellNote(day, meal)}</span>
              ) : null}
              {selected(day, meal) ? (
                <span className="slot-confirm">{confirmText}</span>
              ) : null}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Shared sheet shell, with a positioned desktop variant and modal focus handling. */
export function SlotDialog({
  title,
  anchor,
  breakpoint = 1024,
  initialInput = false,
  onClose,
  children,
}: {
  title: string;
  anchor: HTMLElement | null;
  breakpoint?: number;
  initialInput?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [placement] = useState(() => {
    if (!window.matchMedia(`(min-width: ${breakpoint}px)`).matches || !anchor)
      return null;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 32);
    const height = Math.min(570, window.innerHeight - 32);
    const left =
      rect.left + width <= window.innerWidth - 16
        ? rect.left
        : rect.right - width;
    const top =
      rect.bottom + 8 + height <= window.innerHeight - 16
        ? rect.bottom + 8
        : rect.top - height - 8;
    return {
      top: Math.max(16, Math.min(top, window.innerHeight - height - 16)),
      left: Math.max(16, Math.min(left, window.innerWidth - width - 16)),
    };
  });
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current!;
    (initialInput ? dialog.querySelector("input") : dialog)?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const nodes = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, [href], [tabindex="0"]',
        ),
      ];
      const first = nodes[0],
        last = nodes.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === dialog)
      ) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [initialInput]);
  return createPortal(
    <div
      className={cn("add-day-layer", placement && "is-popover")}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "add-day-dialog frame-panel frame-panel-b focus-ring",
          placement ? "is-popover" : "is-sheet",
        )}
        style={
          placement
            ? {
                ...placement,
                maxHeight: `calc(100dvh - ${placement.top + 16}px)`,
              }
            : undefined
        }
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p
            id={titleId}
            className="truncate text-base font-semibold text-sumi"
          >
            {title}
          </p>
          <button
            type="button"
            className="week-nav-link focus-ring shrink-0"
            onClick={onClose}
          >
            {"取消"}
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function subscribeDesktop(notify: () => void) {
  const media = window.matchMedia("(min-width: 1440px)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}

export function AddToDay({
  dishId,
  dishName,
  items,
  open,
  onOpenChange,
  onToggle,
}: {
  dishId: string;
  dishName: string;
  items: readonly WeekMenuItemView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (day: number, meal: Meal) => void;
}) {
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia("(min-width: 1440px)").matches,
    () => false,
  );
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [selected, setSelected] = useState<{ day: number; meal: Meal } | null>(
    null,
  );
  const button = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      button.current?.focus();
    }
  }, [open]);
  return (
    <>
      <StampButton
        ref={button}
        type="button"
        addedCount={items.filter((i) => i.dishId === dishId).length}
        data-slot-trigger="true"
        className="w-full"
        aria-expanded={open}
        aria-haspopup={desktop ? undefined : "dialog"}
        onClick={(event) => {
          setAnchor(event.currentTarget);
          setSelected(null);
          onOpenChange(!open);
        }}
      />
      {open && !desktop ? (
        <SlotDialog
          title={`『${dishName}』加到哪一顿？`}
          anchor={anchor}
          breakpoint={Infinity}
          onClose={() => onOpenChange(false)}
        >
          <SlotTable
            items={items}
            selected={(day, meal) =>
              selected?.day === day && selected.meal === meal
            }
            disabled={(day, meal) =>
              items.some(
                (i) =>
                  i.dishId === dishId && i.dayOfWeek === day && i.meal === meal,
              )
            }
            onPick={(day, meal) => setSelected({ day, meal })}
          />
          <button
            type="button"
            className="slot-add focus-ring"
            disabled={!selected}
            onClick={() => {
              if (selected) {
                onToggle(selected.day, selected.meal);
                onOpenChange(false);
              }
            }}
          >
            添加
          </button>
        </SlotDialog>
      ) : null}
    </>
  );
}
