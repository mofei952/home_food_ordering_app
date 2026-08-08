import { useEffect, useState } from "react";

import type { MenuItemRead } from "./api";

interface MenuEditorProps {
  menu: MenuItemRead[];
  version: number;
  dishOptions: Array<{ id: string; name: string }>;
  onConfirm: (dishIds: string[]) => Promise<void>;
}

export function MenuEditor({
  menu,
  version,
  dishOptions,
  onConfirm,
}: MenuEditorProps) {
  const [selected, setSelected] = useState<string[]>(
    menu.map((item) => item.dish_id),
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelected(menu.map((item) => item.dish_id));
  }, [menu, version]);

  function toggle(dishId: string) {
    setSelected((current) =>
      current.includes(dishId)
        ? current.filter((id) => id !== dishId)
        : [...current, dishId],
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
    <section aria-label="最终菜单">
      <h3>最终菜单</h3>
      {dishOptions.length === 0 ? (
        <p>还没有可确认的菜品，先去录入菜品吧。</p>
      ) : (
        <ul>
          {dishOptions.map((dish) => (
            <li key={dish.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(dish.id)}
                  onChange={() => toggle(dish.id)}
                />
                {dish.name}
              </label>
              {!selected.includes(dish.id) ? (
                <button
                  type="button"
                  data-write="true"
                  onClick={() => toggle(dish.id)}
                >
                  {`加入最终菜单：${dish.name}`}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        data-write="true"
        disabled={busy || selected.length === 0}
        onClick={() => void handleConfirm()}
      >
        确认菜单
      </button>
    </section>
  );
}
