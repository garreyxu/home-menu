"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
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

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

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
    (notify) => {
      const media = window.matchMedia("(min-width: 1440px)");
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    () => window.matchMedia("(min-width: 1440px)").matches,
    () => false,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const titleId = useId();
  const [selected, setSelected] = useState<{ day: number; meal: Meal } | null>(
    null,
  );
  const planned = items.filter((item) => item.dishId === dishId).length;

  useEffect(() => {
    if (!open || desktop) return;
    dialogRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, desktop]);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    buttonRef.current?.focus();
  }, [open, desktop]);

  function openPicker() {
    setSelected(null);
    onOpenChange(true);
  }

  useEffect(() => {
    if (!open || desktop) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter((node) => !node.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, desktop, onOpenChange]);

  return (
    <>
      <StampButton
        ref={buttonRef}
        type="button"
        addedCount={planned}
        data-slot-trigger="true"
        className="w-full"
        aria-expanded={open}
        aria-haspopup={desktop ? undefined : "dialog"}
        onClick={() => {
          if (open) onOpenChange(false);
          else openPicker();
        }}
      />
      {open && !desktop
        ? createPortal(
            <div
              className="add-day-layer"
              onPointerDown={(event) => {
                if (event.target === event.currentTarget) onOpenChange(false);
              }}
            >
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="add-day-dialog is-sheet frame-panel frame-panel-b focus-ring"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      id={titleId}
                      className="truncate text-base font-semibold text-sumi"
                    >
                      『{dishName}』加到哪一顿？
                    </p>
                  </div>
                  <button
                    type="button"
                    className="week-nav-link frame-tag frame-tag-a focus-ring shrink-0"
                    onClick={() => onOpenChange(false)}
                  >
                    取消
                  </button>
                </div>
                <div className="add-day-grid">
                  <span />
                  {MEALS.map((meal) => (
                    <span key={meal} className="add-day-heading text-center">
                      {MEAL_SHORT[meal]}
                    </span>
                  ))}
                  {DAY_LABELS.map((label, day) => (
                    <div key={label} className="contents">
                      <span className="add-day-heading self-center">
                        {label}
                      </span>
                      {MEALS.map((meal) => {
                        const disabled = items.some(
                          (item) =>
                            item.dishId === dishId &&
                            item.dayOfWeek === day &&
                            item.meal === meal,
                        );
                        return (
                          <button
                            key={`${day}-${meal}`}
                            type="button"
                            className={cn(
                              "add-day-cell focus-ring",
                              selected?.day === day &&
                                selected.meal === meal &&
                                "is-selected",
                            )}
                            disabled={disabled}
                            aria-pressed={
                              selected?.day === day && selected.meal === meal
                            }
                            aria-label={slotLabel(day, meal)}
                            onClick={() => setSelected({ day, meal })}
                          >
                            <span className="slot-dishes">
                              {items
                                .filter(
                                  (item) =>
                                    item.dayOfWeek === day &&
                                    item.meal === meal,
                                )
                                .map((item) => item.dishName)
                                .join("、") || "空"}
                            </span>
                            {selected?.day === day && selected.meal === meal ? (
                              <span className="slot-confirm">✓ 加这顿</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="slot-add focus-ring"
                  disabled={!selected}
                  onClick={() => {
                    if (!selected) return;
                    onToggle(selected.day, selected.meal);
                    onOpenChange(false);
                  }}
                >
                  添加
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
