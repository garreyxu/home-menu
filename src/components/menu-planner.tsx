"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  moveMenuItem,
  addCustomItem,
  renameCustomItem,
  addDishToSlot,
  removeDishFromSlot,
} from "@/app/week-actions";
import { reloadDishWall } from "@/app/wall-actions";
import { CustomItemEditor } from "@/components/custom-item-editor";
import { AddToDay } from "@/components/add-to-day";
import { CategoryNav } from "@/components/category-nav";
import { DishCard } from "@/components/dish-card";
import { RecipeSheet } from "@/components/recipe-sheet";
import { NotionSyncButton } from "@/components/notion-sync-button";
import { EmptyMenu } from "@/components/empty-menu";
import { StampButton } from "@/components/stamp-button";
import { WeekBoard } from "@/components/week-board";
import { reconcileWall, wallKey, type HomeWall } from "@/lib/home-wall";
import {
  DAY_LABELS,
  MEAL_SHORT,
  type WeekMenuItemView,
  type WeekMenuView,
} from "@/lib/menu-slots";
import { moveDuplicate } from "@/lib/move-item";
import { cn } from "@/lib/utils";
import type { Meal } from "@/server/meals";

type Toast = { tone: "ok" | "err"; text: string };

function sameSlot(
  item: WeekMenuItemView,
  day: number,
  meal: Meal,
  dishId: string,
) {
  return item.dayOfWeek === day && item.meal === meal && item.dishId === dishId;
}

function subscribeCompact(notify: () => void) {
  const media = window.matchMedia("(max-width: 1023px)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}

function subscribeDesktop(notify: () => void) {
  const media = window.matchMedia("(min-width: 1440px)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}

export function MenuPlanner({
  wall: serverWall,
  week,
  currentWeekStart,
  todayIso,
  categoryParam,
  weekQuery,
}: {
  wall: HomeWall;
  week: WeekMenuView;
  currentWeekStart: string;
  todayIso: string;
  categoryParam: string | null;
  weekQuery: string | null;
}) {
  const compact = useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia("(max-width: 1023px)").matches,
    () => false,
  );
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia("(min-width: 1440px)").matches,
    () => false,
  );
  const signature = `${week.weekStart}:${JSON.stringify(week.items.map(({ id, dayOfWeek, meal, customName }) => [id, dayOfWeek, meal, customName]))}`;
  const [trackedWeek, setTrackedWeek] = useState(week.weekStart);
  const [trackedSignature, setTrackedSignature] = useState(signature);
  const [items, setItems] = useState(week.items);
  const [customEditor, setCustomEditor] = useState<{
    anchor: HTMLElement;
    item: WeekMenuItemView | null;
  } | null>(null);
  const [pending, setPending] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [openDishId, setOpenDishId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [recipeDishId, setRecipeDishId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [trackedWallKey, setTrackedWallKey] = useState(() =>
    wallKey(serverWall),
  );
  const [wallOverride, setWallOverride] = useState<HomeWall | null>(null);
  const latestRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const weekStartRef = useRef(week.weekStart);

  const reconciled = reconcileWall(trackedWallKey, serverWall, wallOverride);
  if (
    reconciled.trackedKey !== trackedWallKey ||
    reconciled.override !== wallOverride
  ) {
    setTrackedWallKey(reconciled.trackedKey);
    setWallOverride(reconciled.override);
  }
  const wall = reconciled.visible;

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

  const selectedDish = wall.dishes.find((dish) => dish.id === openDishId);
  useEffect(() => {
    if (!openDishId) return;
    function exit(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenDishId(null);
    }
    function outside(event: PointerEvent) {
      if (!window.matchMedia("(min-width: 1440px)").matches) return;
      if (
        event.target instanceof Element &&
        !event.target.closest(".week-panel, [data-slot-trigger], .slot-hint")
      )
        setOpenDishId(null);
    }
    document.addEventListener("keydown", exit);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", exit);
      document.removeEventListener("pointerdown", outside);
    };
  }, [openDishId]);
  function addSelected(
    day: number,
    meal: Meal,
    dishId: string,
    dishName: string,
  ) {
    if (items.some((item) => sameSlot(item, day, meal, dishId))) return;
    toggle(day, meal, dishId, dishName);
    setOpenDishId(null);
    const key = `${dishId}:${day}:${meal}`;
    setFlash(key);
    window.setTimeout(
      () => setFlash((current) => (current === key ? null : current)),
      600,
    );
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

  async function saveCustom(
    action: () => Promise<import("@/lib/menu-slots").MenuActionResult>,
  ) {
    const start = week.weekStart;
    setPending((n) => n + 1);
    const result = queueRef.current.then(action);
    queueRef.current = result.then(
      () => {},
      () => {},
    );
    try {
      const value = await result;
      if (weekStartRef.current === start) {
        if (value.ok) setItems(value.week.items);
        else showToast({ tone: "err", text: value.error });
      }
      return value;
    } catch {
      const result = { ok: false as const, error: "没能改菜单，请再试一次。" };
      if (weekStartRef.current === start)
        showToast({ tone: "err", text: result.error });
      return result;
    } finally {
      setPending((n) => n - 1);
    }
  }

  const thumbs: Record<string, string | undefined> = {};
  for (const dish of wall.dishes) {
    if (dish.illustration) thumbs[dish.id] = dish.illustration.thumb;
  }

  function move(item: WeekMenuItemView, day: number, meal: Meal) {
    if (item.dayOfWeek === day && item.meal === meal) return;
    if (moveDuplicate(items, item, day, meal)) {
      showToast({ tone: "err", text: "这顿已经有了" });
      return;
    }
    const start = week.weekStart;
    const token = ++latestRef.current;
    setItems((current) =>
      current.map((i) =>
        i.id === item.id ? { ...i, dayOfWeek: day, meal } : i,
      ),
    );
    setPending((n) => n + 1);
    queueRef.current = queueRef.current.then(async () => {
      try {
        const result = await moveMenuItem(item.id, day, meal, start);
        if (weekStartRef.current !== start) return;
        if (!result.ok) throw new Error(result.error);
        if (token === latestRef.current) setItems(result.week.items);
        showToast({
          tone: "ok",
          text: `已移到${DAY_LABELS[day]}${meal === "dinner" ? "晚饭" : meal === "lunch" ? "午饭" : "早饭"}`,
        });
      } catch (error) {
        if (weekStartRef.current !== start) return;
        setItems((current) =>
          current.map((i) =>
            i.id === item.id
              ? { ...i, dayOfWeek: item.dayOfWeek, meal: item.meal }
              : i,
          ),
        );
        showToast({
          tone: "err",
          text:
            error instanceof Error && error.message === "这顿已经有了"
              ? error.message
              : "没挪成，再试一次",
        });
      } finally {
        setPending((n) => n - 1);
      }
    });
  }

  function remove(item: WeekMenuItemView) {
    if (!item.dishId) {
      void saveCustom(() =>
        removeDishFromSlot({
          weekStart: week.weekStart,
          dayOfWeek: item.dayOfWeek,
          meal: item.meal,
          id: item.id,
        }),
      );
      return;
    }
    const dish = wall.dishes.find((entry) => entry.id === item.dishId);
    toggle(item.dayOfWeek, item.meal, item.dishId, dish?.name ?? item.dishName);
  }

  const boardDish = desktop ? selectedDish : undefined;
  const board = (
    <WeekBoard
      interactive={true}
      onMove={move}
      onToast={(text) => showToast({ tone: "err", text })}
      weekStart={week.weekStart}
      currentWeekStart={currentWeekStart}
      todayIso={todayIso}
      items={items}
      categoryParam={categoryParam}
      thumbs={thumbs}
      selectingDish={boardDish}
      flash={flash}
      onSelect={(day, meal) => {
        if (boardDish) addSelected(day, meal, boardDish.id, boardDish.name);
      }}
      onCancel={() => setOpenDishId(null)}
      onCustom={(anchor, item) => {
        setOpenDishId(null);
        setCustomEditor({ anchor, item });
      }}
      onRemove={remove}
    />
  );

  return (
    <>
      <div className="flex w-full flex-col gap-4 px-4 pt-4 pb-24 sm:px-6 lg:flex-row lg:items-start lg:gap-6 lg:pb-4 min-[2560px]:gap-5 min-[2560px]:px-8">
        <CategoryNav
          categories={wall.categories}
          selected={wall.selectedCategory}
          week={weekQuery}
        />
        <main className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div className="inline-flex max-w-full flex-col gap-1">
              <h2
                id="dish-wall-heading"
                className={cn(
                  "text-sumi",
                  wall.brushHeading
                    ? "section-title font-brush"
                    : "font-sans text-lg font-semibold",
                )}
              >
                {wall.heading}
              </h2>
              <p className="text-sm text-sumi-soft">
                <span className="font-bold text-sumi">
                  {wall.dishes.length}
                </span>
                道菜
              </p>
            </div>
            <div className="flex w-full min-w-0 max-w-full flex-wrap items-end justify-end gap-3 sm:w-auto">
              <NotionSyncButton
                onSynced={async () => {
                  const next = await reloadDishWall(categoryParam);
                  setWallOverride(next);
                }}
              />
              <StampButton
                type="button"
                tone="outline"
                className="week-drawer-toggle"
                aria-expanded={drawerOpen}
                aria-controls="week-drawer"
                onClick={() => setDrawerOpen((open) => !open)}
              >
                本周 {items.length}
              </StampButton>
            </div>
          </div>
          {wall.emptyMessage ? (
            <EmptyMenu message={wall.emptyMessage} />
          ) : (
            <ul
              aria-labelledby="dish-wall-heading"
              className="dish-grid grid grid-cols-2 gap-4 sm:grid-cols-3"
            >
              {wall.dishes.map((dish) => {
                const plannedCount = items.filter(
                  (item) => item.dishId === dish.id,
                ).length;
                return (
                  <li
                    key={dish.id}
                    className="min-w-0"
                    data-category={dish.categoryName}
                  >
                    <DishCard
                      id={dish.id}
                      name={dish.name}
                      description={dish.description}
                      illustration={dish.illustration}
                      tried={dish.tried}
                      plannedCount={plannedCount}
                      onOpenRecipe={() => {
                        setOpenDishId(null);
                        setRecipeDishId(dish.id);
                      }}
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
                            addSelected(day, meal, dish.id, dish.name)
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
          {desktop ? board : null}
        </aside>
      </div>
      {drawerOpen && !desktop && !compact ? (
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
            {board}
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
            {trayOpen && compact ? board : null}
          </div>
        </div>
        <button
          type="button"
          className="week-tray-toggle focus-ring"
          aria-expanded={trayOpen}
          aria-controls="week-tray-panel"
          onClick={() => setTrayOpen((open) => !open)}
        >
          本周已点 {items.length} 道
        </button>
      </div>
      {customEditor ? (
        <CustomItemEditor
          key={`${week.weekStart}:${customEditor.item?.id ?? "new"}`}
          {...customEditor}
          items={items}
          onClose={() => setCustomEditor(null)}
          onSave={(value) =>
            saveCustom(() =>
              value.id
                ? renameCustomItem(value)
                : addCustomItem({ ...value, weekStart: week.weekStart }),
            )
          }
        />
      ) : null}
      {recipeDishId ? (
        <RecipeSheet
          key={recipeDishId}
          dishId={recipeDishId}
          dishName={
            wall.dishes.find((dish) => dish.id === recipeDishId)?.name ?? ""
          }
          onClose={() => {
            const id = recipeDishId;
            setRecipeDishId(null);
            window.requestAnimationFrame(() => {
              document
                .querySelector<HTMLElement>(
                  `[data-recipe-for="${CSS.escape(id)}"]`,
                )
                ?.focus();
            });
          }}
        />
      ) : null}
      {toast ? (
        <p
          role={toast.tone === "err" ? "alert" : "status"}
          className={cn(
            "menu-toast frame-tag frame-tag-a",
            toast.tone === "err" && "is-error",
          )}
        >
          <span className="toast-seal" aria-hidden="true" />
          {toast.text}
        </p>
      ) : null}
    </>
  );
}
