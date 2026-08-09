import { useEffect, useMemo, useState } from "react";

import type { MenuItemRead, MergedMealRequestRead } from "./api";

function dishIdsFromMenu(menu: MenuItemRead[]): string[] {
  return menu.map((item) => item.dish_id);
}

function dishIdsFromRequests(requests: MergedMealRequestRead[]): string[] {
  return requests.map((item) => item.dish_id);
}

function initialSelected(
  menu: MenuItemRead[],
  requests: MergedMealRequestRead[],
): string[] {
  const menuIds = dishIdsFromMenu(menu);
  if (menuIds.length > 0) {
    return menuIds;
  }
  return dishIdsFromRequests(requests);
}

interface MenuEditorProps {
  menu: MenuItemRead[];
  requests: MergedMealRequestRead[];
  version: number;
  dishOptions: Array<{ id: string; name: string }>;
  onConfirm: (dishIds: string[]) => Promise<void>;
  confirmed: boolean;
  onSelectionChange?: (dishIds: string[]) => void;
}

export function MenuEditor({
  menu,
  requests = [],
  version,
  dishOptions,
  onConfirm,
  confirmed,
  onSelectionChange,
}: MenuEditorProps) {
  const [selected, setSelected] = useState<string[]>(() =>
    initialSelected(menu, requests),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const requestDishIds = useMemo(() => dishIdsFromRequests(requests), [requests]);

  useEffect(() => {
    const menuIds = dishIdsFromMenu(menu);
    if (menuIds.length > 0) {
      setSelected(menuIds);
      return;
    }
    setSelected(requestDishIds);
  }, [menu, version, requestDishIds]);

  useEffect(() => {
    onSelectionChange?.(selected);
  }, [selected, onSelectionChange]);

  const nameById = new Map(dishOptions.map((dish) => [dish.id, dish.name]));

  function updateSelected(next: string[]) {
    setSelected(next);
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    updateSelected(next);
  }

  function removeAt(index: number) {
    updateSelected(selected.filter((_, i) => i !== index));
  }

  function togglePick(dishId: string) {
    updateSelected(
      selected.includes(dishId)
        ? selected.filter((id) => id !== dishId)
        : [...selected, dishId],
    );
  }

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm(selected);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card" aria-label="最终菜单">
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "var(--text-title)" }}>
          确认菜单
        </h3>
        {selected.length === 0 ? (
          <p className="page__lead">
            {requests.length > 0
              ? "想吃清单里有菜，点「采用想吃清单」或从菜品库勾选后加入确认。"
              : "从想吃清单或菜品库添加要确认的菜品。"}
          </p>
        ) : (
          <ol className="menu-list">
            {selected.map((dishId, index) => (
              <li className="menu-list__item" key={dishId}>
                <p className="menu-list__name">
                  {nameById.get(dishId) ?? "未知菜品"}
                </p>
                <div className="menu-list__controls">
                  <button
                    type="button"
                    className="btn--ghost btn--icon"
                    aria-label="上移"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn--ghost btn--icon"
                    aria-label="下移"
                    disabled={index === selected.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn--ghost btn--icon"
                    aria-label="移除"
                    onClick={() => removeAt(index)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}

        {requests.length > 0 && selected.length === 0 ? (
          <button
            type="button"
            className="btn--soft"
            style={{ width: "100%", marginTop: "0.75rem" }}
            onClick={() => updateSelected(dishIdsFromRequests(requests))}
          >
            采用想吃清单（{requests.length} 道）
          </button>
        ) : null}

        <button
          type="button"
          className="btn--ghost"
          style={{ width: "100%", marginTop: "0.75rem" }}
          onClick={() => setPickerOpen((open) => !open)}
        >
          {pickerOpen ? "收起菜品库" : "从菜品库添加"}
        </button>

        {pickerOpen ? (
          <ul className="menu-picker-list">
            {dishOptions.map((dish) => (
              <li className="menu-picker-list__item" key={dish.id}>
                <label className="menu-picker-list__label">
                  <input
                    type="checkbox"
                    checked={selected.includes(dish.id)}
                    onChange={() => togglePick(dish.id)}
                  />
                  <span>{dish.name}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="today-confirm-bar">
        <div className="today-confirm-bar__inner">
          <button
            type="button"
            data-write="true"
            data-testid="confirm-menu"
            disabled={busy || selected.length === 0}
            onClick={() => void handleConfirm()}
          >
            {confirmed ? `更新菜单（${selected.length} 道）` : `确认菜单（${selected.length} 道）`}
          </button>
        </div>
      </div>
    </>
  );
}
