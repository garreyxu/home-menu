"use client";
import {
  startTransition,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  clearShoppingChecks,
  loadShoppingList,
  toggleShoppingCheck,
  type ShoppingData,
} from "@/app/shopping-actions";
import { shoppingRows, type ShoppingRow } from "@/lib/shopping-list";
import { formatWeekRange } from "@/server/week";

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
  async function change(name?: string, checked?: boolean) {
    if (!data || pending.current) return;
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
      <label key={item.name} className="shopping-row" data-checked={checked}>
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
          <span className="shopping-name">{item.name}</span>
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
                <section
                  key={group.name}
                  className="shopping-group"
                  aria-label={group.name}
                >
                  <h3 className="font-brush">{group.name}</h3>
                  {group.rows.map(row)}
                </section>
              ))}
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
                    {data.list.pantry.map(row)}
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
