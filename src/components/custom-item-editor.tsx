"use client";

import { useState } from "react";
import { SlotDialog, SlotTable } from "@/components/add-to-day";
import { customNameKey } from "@/lib/custom-name";
import type { MenuActionResult, WeekMenuItemView } from "@/lib/menu-slots";
import type { Meal } from "@/server/meals";

export function CustomItemEditor({
  item,
  anchor,
  items,
  onClose,
  onSave,
}: {
  item: WeekMenuItemView | null;
  anchor: HTMLElement;
  items: readonly WeekMenuItemView[];
  onClose: () => void;
  onSave: (value: {
    name: string;
    day: number;
    meal: Meal;
    id?: string;
  }) => Promise<MenuActionResult>;
}) {
  const [name, setName] = useState(item?.customName ?? "");
  const [slot, setSlot] = useState<{ day: number; meal: Meal } | null>(
    item ? { day: item.dayOfWeek, meal: item.meal } : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const duplicate =
    slot &&
    name.trim() &&
    items.some(
      (i) =>
        i.id !== item?.id &&
        i.dayOfWeek === slot.day &&
        i.meal === slot.meal &&
        i.customName &&
        customNameKey(i.customName) === customNameKey(name),
    );
  return (
    <SlotDialog
      title={item ? "编辑自定义条目" : "自定义条目"}
      anchor={anchor}
      breakpoint={1440}
      initialInput
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!slot || !name.trim() || duplicate || busy) return;
          setBusy(true);
          setError("");
          try {
            const result = await onSave({
              name,
              ...slot,
              ...(item ? { id: item.id } : {}),
            });
            if (result.ok) onClose();
            else setError(result.error);
          } catch {
            setError("没能改菜单，请再试一次。");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          aria-label="自定义名称"
          placeholder="写点什么，比如：寿司外卖"
          maxLength={40}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          className="custom-name-input focus-ring"
        />
        <p className="mb-3 text-right text-xs text-sumi-soft">
          {name.length}/40
        </p>
        <SlotTable
          items={items}
          selected={(day, meal) => slot?.day === day && slot.meal === meal}
          onPick={(day, meal) => {
            setSlot({ day, meal });
            setError("");
          }}
        />
        <p role="alert" className="custom-error">
          {duplicate ? "这顿已经有了" : error}
        </p>
        <button
          type="submit"
          disabled={!name.trim() || !slot || !!duplicate || busy}
          className="custom-submit focus-ring"
        >
          {item ? "保存" : "放进去"}
        </button>
      </form>
    </SlotDialog>
  );
}
