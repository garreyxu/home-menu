"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const titleId = useId();
  const [placement, setPlacement] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const planned = items.filter((item) => item.dishId === dishId).length;

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    buttonRef.current?.focus();
  }, [open]);

  function openPopover() {
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!wide || !rect) {
      setPlacement(null);
      onOpenChange(true);
      return;
    }
    const width = Math.min(420, window.innerWidth - 16);
    const left = Math.min(
      Math.max(8, rect.left),
      window.innerWidth - width - 8,
    );
    const height = 280;
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - height - 8);
    }
    setPlacement({ top, left });
    onOpenChange(true);
  }

  useEffect(() => {
    if (!open) return;
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
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <>
      <StampButton
        ref={buttonRef}
        type="button"
        addedCount={planned}
        className="w-full"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) onOpenChange(false);
          else openPopover();
        }}
      />
      {open
        ? createPortal(
            <div
              className={cn("add-day-layer", placement && "is-popover")}
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
                className={cn(
                  "add-day-dialog frame-panel frame-panel-b focus-ring",
                  placement ? "is-popover" : "is-sheet",
                )}
                style={
                  placement
                    ? { top: placement.top, left: placement.left }
                    : undefined
                }
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      id={titleId}
                      className="truncate text-base font-semibold text-sumi"
                    >
                      {dishName}
                    </p>
                    <p className="text-sm text-sumi-soft">
                      点一格排上，再点一次取消
                    </p>
                  </div>
                  <button
                    type="button"
                    className="week-nav-link frame-tag frame-tag-a focus-ring shrink-0"
                    onClick={() => onOpenChange(false)}
                  >
                    关闭
                  </button>
                </div>
                <div className="add-day-grid">
                  <span />
                  {DAY_LABELS.map((label) => (
                    <span
                      key={label}
                      className="add-day-heading text-center font-brush text-sumi"
                    >
                      {label.slice(1)}
                    </span>
                  ))}
                  {MEALS.map((meal) => (
                    <div key={meal} className="contents">
                      <span className="add-day-heading font-brush text-sumi">
                        {MEAL_SHORT[meal]}
                      </span>
                      {DAY_LABELS.map((_, day) => {
                        const selected = items.some(
                          (item) =>
                            item.dishId === dishId &&
                            item.dayOfWeek === day &&
                            item.meal === meal,
                        );
                        return (
                          <button
                            key={`${day}-${meal}`}
                            type="button"
                            className="add-day-cell focus-ring"
                            aria-pressed={selected}
                            aria-label={slotLabel(day, meal)}
                            onClick={() => onToggle(day, meal)}
                          >
                            {selected ? (
                              <span
                                className="add-day-dot"
                                aria-hidden="true"
                              />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
