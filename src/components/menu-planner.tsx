"use client";

import { useEffect, useRef, useState } from "react";
import { addDishToSlot, removeDishFromSlot } from "@/app/week-actions";
import { AddToDay } from "@/components/add-to-day";
import { DishCard } from "@/components/dish-card";
import { NotionSyncButton } from "@/components/notion-sync-button";
import { EmptyMenu } from "@/components/empty-menu";
import { PixelButton } from "@/components/pixel-frame";
import { WeekBoard } from "@/components/week-board";
import {
  DAY_LABELS,
  MEAL_SHORT,
  type WeekMenuItemView,
  type WeekMenuView,
} from "@/lib/menu-slots";
import { cn } from "@/lib/utils";
import type { Meal } from "@/server/meals";

export type PlannerDish = {
  id: string;
  name: string;
  categoryName: string;
  photoUrl?: string | null;
  tried?: boolean;
};

type Toast = { tone: "ok" | "err"; text: string };

function sameSlot(
  item: WeekMenuItemView,
  day: number,
  meal: Meal,
  dishId: string,
) {
  return item.dayOfWeek === day && item.meal === meal && item.dishId === dishId;
}

export function MenuPlanner({
  dishes,
  heading,
  pixelHeading,
  emptyMessage,
  week,
  currentWeekStart,
  todayIso,
  categoryParam,
}: {
  dishes: readonly PlannerDish[];
  heading: string;
  pixelHeading: boolean;
  emptyMessage: string | null;
  week: WeekMenuView;
  currentWeekStart: string;
  todayIso: string;
  categoryParam: string | null;
}) {
  const signature = `${week.weekStart}:${week.items.map((item) => item.id).join("|")}`;
  const [trackedWeek, setTrackedWeek] = useState(week.weekStart);
  const [trackedSignature, setTrackedSignature] = useState(signature);
  const [items, setItems] = useState(week.items);
  const [pending, setPending] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [openDishId, setOpenDishId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const latestRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const weekStartRef = useRef(week.weekStart);

  useEffect(() => {
    weekStartRef.current = week.weekStart;
  }, [week.weekStart]);

  if (trackedWeek !== week.weekStart) {
    setTrackedWeek(week.weekStart);
    setTrackedSignature(signature);
    setItems(week.items);
    setOpenDishId(null);
  } else if (trackedSignature !== signature && pending === 0) {
    setTrackedSignature(signature);
    setItems(week.items);
  }

  function showToast(next: Toast) {
    setToast(next);
    window.setTimeout(
      () => {
        setToast((current) => (current === next ? null : current));
      },
      next.tone === "err" ? 4000 : 2500,
    );
  }

  function restoreSlot(
    current: WeekMenuItemView[],
    day: number,
    meal: Meal,
    dishId: string,
    existed: WeekMenuItemView | null,
  ) {
    if (existed) {
      if (current.some((item) => sameSlot(item, day, meal, dishId))) {
        return current;
      }
      return [...current, existed];
    }
    return current.filter((item) => !sameSlot(item, day, meal, dishId));
  }

  function toggle(day: number, meal: Meal, dishId: string, dishName: string) {
    const weekStart = week.weekStart;
    const existing =
      items.find((item) => sameSlot(item, day, meal, dishId)) ?? null;
    setItems(
      existing
        ? items.filter((item) => !sameSlot(item, day, meal, dishId))
        : [
            ...items,
            {
              id: `pending:${dishId}:${day}:${meal}`,
              dayOfWeek: day,
              meal,
              dishId,
              dishName,
            },
          ],
    );

    const token = ++latestRef.current;
    setPending((count) => count + 1);
    const input = { weekStart, dayOfWeek: day, meal, dishId };

    queueRef.current = queueRef.current.then(async () => {
      try {
        const result = existing
          ? await removeDishFromSlot(input)
          : await addDishToSlot(input);
        if (weekStartRef.current !== weekStart) return;
        if (!result.ok) {
          setItems((current) =>
            restoreSlot(current, day, meal, dishId, existing),
          );
          showToast({ tone: "err", text: result.error });
          return;
        }
        if (token === latestRef.current) setItems(result.week.items);
        if (result.added && token === latestRef.current) {
          showToast({
            tone: "ok",
            text: `已加到 ${DAY_LABELS[day]}·${MEAL_SHORT[meal]}`,
          });
        }
      } catch {
        if (weekStartRef.current !== weekStart) return;
        setItems((current) =>
          restoreSlot(current, day, meal, dishId, existing),
        );
        showToast({ tone: "err", text: "没能改菜单，请再试一次。" });
      } finally {
        setPending((count) => count - 1);
      }
    });
  }

  function renderBoard() {
    return (
      <WeekBoard
        weekStart={week.weekStart}
        currentWeekStart={currentWeekStart}
        todayIso={todayIso}
        items={items}
        categoryParam={categoryParam}
        onRemove={(item) => {
          const dish = dishes.find((entry) => entry.id === item.dishId);
          toggle(
            item.dayOfWeek,
            item.meal,
            item.dishId,
            dish?.name ?? item.dishName,
          );
        }}
      />
    );
  }

  return (
    <>
      <main className="min-w-0 flex-1">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="inline-flex max-w-full flex-col gap-1 bg-cream px-3 py-2">
            <h2
              id="dish-wall-heading"
              className={cn(
                "text-ink",
                pixelHeading
                  ? "font-pixel pixel-type text-pixel-2"
                  : "font-sans text-lg font-semibold",
              )}
            >
              {heading}
            </h2>
            <p className="text-sm text-driftwood">
              <span className="font-pixel pixel-type text-pixel-1 text-ink">
                {dishes.length}
              </span>
              道菜
            </p>
          </div>
          <div className="flex w-full min-w-0 max-w-full flex-wrap items-end justify-end gap-3 sm:w-auto">
            <NotionSyncButton />
            <PixelButton
              type="button"
              tone="cream"
              size="sm"
              className="week-drawer-toggle"
              aria-expanded={drawerOpen}
              aria-controls="week-drawer"
              onClick={() => setDrawerOpen((open) => !open)}
            >
              本周 {items.length}
            </PixelButton>
          </div>
        </div>
        {emptyMessage ? (
          <EmptyMenu message={emptyMessage} />
        ) : (
          <ul
            aria-labelledby="dish-wall-heading"
            className="dish-grid grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] min-[1920px]:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] min-[2560px]:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] min-[2560px]:gap-5"
          >
            {dishes.map((dish) => {
              const plannedCount = items.filter(
                (item) => item.dishId === dish.id,
              ).length;
              return (
                <li key={dish.id} className="min-w-0">
                  <DishCard
                    name={dish.name}
                    categoryName={dish.categoryName}
                    photoUrl={dish.photoUrl}
                    tried={dish.tried}
                    plannedCount={plannedCount}
                    action={
                      <AddToDay
                        dishId={dish.id}
                        dishName={dish.name}
                        items={items}
                        open={openDishId === dish.id}
                        onOpenChange={(open) =>
                          setOpenDishId(open ? dish.id : null)
                        }
                        onToggle={(day, meal) =>
                          toggle(day, meal, dish.id, dish.name)
                        }
                      />
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <aside className="week-panel" role="region" aria-label="一周菜单">
        {renderBoard()}
      </aside>
      {drawerOpen ? (
        <div className="week-drawer-layer">
          <button
            type="button"
            className="week-drawer-backdrop"
            aria-label="关闭一周菜单"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            id="week-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="一周菜单"
            className="week-drawer-panel"
          >
            {renderBoard()}
          </div>
        </div>
      ) : null}
      <div className="week-tray">
        <div
          id="week-tray-panel"
          hidden={!trayOpen}
          className="week-tray-panel"
        >
          <div role="region" aria-label="一周菜单">
            {renderBoard()}
          </div>
        </div>
        <button
          type="button"
          className="week-tray-toggle pixel-focus"
          aria-expanded={trayOpen}
          aria-controls="week-tray-panel"
          onClick={() => setTrayOpen((open) => !open)}
        >
          本周已点 {items.length} 道
        </button>
      </div>
      {toast ? (
        <p
          role={toast.tone === "err" ? "alert" : "status"}
          className={cn("menu-toast", toast.tone === "err" && "is-error")}
        >
          {toast.text}
        </p>
      ) : null}
    </>
  );
}
