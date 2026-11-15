"use client";
import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  clearShoppingChecks,
  loadShoppingList,
  toggleShoppingCheck,
  type ShoppingData,
} from "@/app/shopping-actions";
import {
  partitionByChecked,
  shoppingRows,
  type ShoppingRow,
} from "@/lib/shopping-list";
import { formatWeekRange } from "@/server/week";

const REORDER_MS = 180;

function orderedShoppingRows(
  rows: readonly ShoppingRow[],
  checked: readonly string[],
) {
  const bought = new Set(checked);
  return partitionByChecked(
    rows.map((row) => ({ ...row, checked: bought.has(row.name) })),
  );
}

function orderKey(rows: readonly { name: string }[]) {
  return rows.map((row) => row.name).join("\0");
}

/** Slide a row from its previous slot. Offset ignores scroll and transforms. */
function useReorderMotion<T extends HTMLElement>(
  signature: string,
  enabled = true,
) {
  const ref = useRef<T>(null);
  const previous = useRef(new Map<string, number>());
  const generation = useRef(0);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !enabled) {
      previous.current = new Map();
      return;
    }
    const rows = [
      ...root.querySelectorAll<HTMLElement>(":scope > .shopping-row"),
    ];
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const next = new Map<string, number>();
    const moves: { row: HTMLElement; delta: number }[] = [];
    for (const row of rows) {
      const name = row.dataset.ingredient;
      if (!name) continue;
      const top = row.offsetTop;
      next.set(name, top);
      const from = previous.current.get(name);
      if (reduce || from === undefined) continue;
      const delta = from - top;
      if (Math.abs(delta) < 1) continue;
      moves.push({ row, delta });
    }
    const token = ++generation.current;
    for (const { row, delta } of moves) {
      row.style.transition = "none";
      row.style.transform = `translateY(${delta}px)`;
    }
    if (moves.length) root.getBoundingClientRect();
    for (const { row } of moves) {
      row.style.transition = `transform ${REORDER_MS}ms ease-out`;
      row.style.transform = "";
      const done = (event: Event) => {
        if (token !== generation.current) return;
        if (
          !(event instanceof TransitionEvent) ||
          event.propertyName !== "transform"
        )
          return;
        row.style.transition = "";
        row.removeEventListener("transitionend", done);
      };
      row.addEventListener("transitionend", done);
    }
    previous.current = next;
  }, [signature, enabled]);
  return ref;
}

function ShoppingGroup({
  name,
  rows,
  checked,
  render,
}: {
  name: string;
  rows: ShoppingRow[];
  checked: readonly string[];
  render: (item: ShoppingRow) => ReactNode;
}) {
  const ordered = orderedShoppingRows(rows, checked);
  const ref = useReorderMotion<HTMLElement>(orderKey(ordered));
  return (
    <section ref={ref} className="shopping-group" aria-label={name}>
      <h3 className="font-brush">{name}</h3>
      {ordered.map(render)}
    </section>
  );
}

function PantryRows({
  rows,
  checked,
  open,
  render,
}: {
  rows: ShoppingRow[];
  checked: readonly string[];
  open: boolean;
  render: (item: ShoppingRow) => ReactNode;
}) {
  const ordered = orderedShoppingRows(rows, checked);
  const ref = useReorderMotion<HTMLDivElement>(orderKey(ordered), open);
  return <div ref={ref}>{ordered.map(render)}</div>;
}

export function ShoppingListButton({
  weekStart,
  count,
  menuKey,
}: {
  weekStart: string;
  count: number;
  menuKey: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span title={count ? undefined : "先点几道菜"}>
        <button
          type="button"
          className="week-nav-link frame-tag frame-tag-a shopping-entry"
          aria-disabled={!count}
          aria-label={count ? "买菜单" : "买菜单，先点几道菜"}
          onClick={() => {
            if (count) setOpen(true);
          }}
        >
          买菜单
        </button>
      </span>
      {open ? (
        <ShoppingSheet
          key={weekStart}
          weekStart={weekStart}
          menuKey={menuKey}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
function ShoppingSheet({
  weekStart,
  menuKey,
  onClose,
}: {
  weekStart: string;
  menuKey: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pantryId = useId();
  const [data, setData] = useState<ShoppingData | null>(null);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState("");
  const [pantryOpen, setPantryOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const version = useRef(0);
  const mounted = useRef(true);
  const place = useRef<{
    pageY: number;
    list: number;
    focus: HTMLElement | null;
  } | null>(null);
  const invalidate = useCallback(() => {
    version.current++;
  }, []);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    const request = ++version.current;
    try {
      const result = await loadShoppingList(weekStart);
      if (!mounted.current || request !== version.current) return;
      if (result.ok) {
        setData(result.data);
        setError(false);
      } else setError(true);
    } catch {
      if (mounted.current && request === version.current) setError(true);
    }
  }, [weekStart]);
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = dialog.current;
    panel?.showModal();
    return () => {
      mounted.current = false;
      invalidate();
      document.body.style.overflow = overflow;
      panel?.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [invalidate]);
  useEffect(() => {
    startTransition(() => {
      void refresh();
    });
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      invalidate();
      window.removeEventListener("focus", focus);
    };
  }, [refresh, menuKey, invalidate]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useLayoutEffect(() => {
    const held = place.current;
    if (!held) return;
    const scroller = dialog.current?.querySelector(".shopping-scroll");
    if (scroller instanceof HTMLElement) scroller.scrollTop = held.list;
    if (window.scrollY !== held.pageY)
      window.scrollTo(window.scrollX, held.pageY);
    const focus = held.focus;
    if (
      focus?.isConnected &&
      document.activeElement !== focus &&
      (document.activeElement === document.body ||
        document.activeElement === dialog.current)
    )
      focus.focus({ preventScroll: true });
    if (!pending.current) place.current = null;
  });
  async function change(name?: string, checked?: boolean) {
    if (!data || pending.current) return;
    const scroller = dialog.current?.querySelector(".shopping-scroll");
    place.current = {
      pageY: window.scrollY,
      list: scroller instanceof HTMLElement ? scroller.scrollTop : 0,
      focus:
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
    };
    const previous = data;
    pending.current = true;
    version.current++;
    setBusy(true);
    setToast("");
    setData({
      ...data,
      checked: name
        ? checked
          ? [...data.checked, name]
          : data.checked.filter((item) => item !== name)
        : [],
    });
    setConfirm(false);
    try {
      const result = name
        ? await toggleShoppingCheck(weekStart, name, checked)
        : await clearShoppingChecks(weekStart);
      if (!result.ok) throw new Error("shopping update failed");
      if (mounted.current) {
        setData(result.data);
        setError(false);
      }
    } catch {
      if (mounted.current) {
        setData(previous);
        setToast("没能保存勾选，再试一次");
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const allRows = data ? shoppingRows(data.list) : [];
  const bought = data?.checked.length ?? 0;
  function row(item: ShoppingRow) {
    const checked = data!.checked.includes(item.name);
    return (
      <label
        key={item.name}
        className="shopping-row"
        data-checked={checked}
        data-ingredient={item.name}
      >
        <input
          type="checkbox"
          checked={checked}
          aria-disabled={busy}
          aria-label={`${item.name}，${item.dishes.join("、")}要用，${checked ? "已买" : "未买"}`}
          onChange={() => {
            void change(item.name, !checked);
          }}
        />
        <span className="shopping-box" aria-hidden="true">
          {checked ? <span>✓</span> : null}
        </span>
        <span className="shopping-copy">
          <span
            className="shopping-name"
            style={{ textDecorationLine: checked ? "line-through" : "none" }}
          >
            {item.name}
          </span>
          {item.optional ? (
            <small className="shopping-optional">（可选）</small>
          ) : null}
        </span>
        <span className="shopping-dishes" title={item.dishes.join("、")}>
          {item.dishes.join("、")}
        </span>
      </label>
    );
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="shopping-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="shopping-paper"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="shopping-handle" aria-hidden="true" />
        <header className="shopping-header">
          <div>
            <h2 id={titleId} className="font-brush">
              买菜单
            </h2>
            <p>
              {formatWeekRange(weekStart)} · 共 {allRows.length} 样
            </p>
          </div>
          <button
            type="button"
            className="shopping-close"
            aria-label="关闭买菜单"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {data ? (
          <div className="shopping-progress">
            <span aria-live="polite">
              已买 {bought} / {allRows.length}
            </span>
            <div
              role="progressbar"
              aria-label="采购进度"
              aria-valuemin={0}
              aria-valuemax={allRows.length || 1}
              aria-valuenow={bought}
            >
              <span
                style={{
                  width: `${allRows.length ? (bought / allRows.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        ) : null}
        <div className="shopping-scroll" aria-busy={!data && !error}>
          {error ? (
            <div className="shopping-state" role="alert">
              <p>清单没拿到，再试一次</p>
              <button
                className="stamp-button"
                onClick={() => {
                  void refresh();
                }}
              >
                重试
              </button>
            </div>
          ) : !data ? (
            <p role="status">正在写买菜单…</p>
          ) : data.menuEmpty ? (
            <div className="shopping-state">
              <p className="font-brush">这周还没点菜</p>
              <a
                className="stamp-button"
                href="#dish-wall-heading"
                onClick={onClose}
              >
                去菜单挑挑
              </a>
            </div>
          ) : (
            <>
              {allRows.length === 0 ? (
                <p className="shopping-state">这周的菜还没有食材清单</p>
              ) : null}
              {data.list.groups.map((group) => (
                <ShoppingGroup
                  key={group.name}
                  name={group.name}
                  rows={group.rows}
                  checked={data.checked}
                  render={row}
                />
              ))}
              {data.missing.length ? (
                <p className="shopping-missing text-xs text-sumi-soft break-words">
                  这些菜还没有食材：{data.missing.join("、")}
                </p>
              ) : null}
              {data.list.pantry.length ? (
                <section className="shopping-pantry">
                  <button
                    type="button"
                    aria-expanded={pantryOpen}
                    aria-controls={pantryId}
                    onClick={() => setPantryOpen(!pantryOpen)}
                  >
                    家里常备（{data.list.pantry.length}）
                    {pantryOpen ? "▾" : "▸"}
                  </button>
                  <div id={pantryId} hidden={!pantryOpen}>
                    <p>看一眼家里还有没有</p>
                    <PantryRows
                      rows={data.list.pantry}
                      checked={data.checked}
                      open={pantryOpen}
                      render={row}
                    />
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
        {data ? (
          <footer className="shopping-footer">
            {confirm ? (
              <div role="group" aria-label="确认清空勾选">
                <p>把这周的勾都去掉？</p>
                <button
                  type="button"
                  onClick={() => {
                    void change();
                  }}
                  disabled={busy}
                >
                  确认清空
                </button>
                <button type="button" onClick={() => setConfirm(false)}>
                  取消
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                清空勾选
              </button>
            )}
          </footer>
        ) : null}
        <div role="status" className={toast ? "shopping-toast" : "sr-only"}>
          {toast}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
