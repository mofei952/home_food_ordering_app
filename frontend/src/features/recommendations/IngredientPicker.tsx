import { useEffect, useState } from "react";

import { ApiError } from "../../api/client";
import { searchIngredients, type IngredientRead } from "../dishes/api";

interface IngredientPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Called when a visible ingredient is toggled so parents can track names. */
  onToggleIngredient?: (
    ingredient: IngredientRead,
    selected: boolean,
  ) => void;
}

export function IngredientPicker({
  selectedIds,
  onChange,
  onToggleIngredient,
}: IngredientPickerProps) {
  const [query, setQuery] = useState("");
  const [ingredients, setIngredients] = useState<IngredientRead[]>([]);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await searchIngredients(query || undefined);
        if (!cancelled) {
          setIngredients(result);
          setError(undefined);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof ApiError ? caught.message : "加载食材失败",
          );
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [query]);

  function toggle(ingredient: IngredientRead) {
    const selected = !selectedIds.includes(ingredient.id);
    if (selected) {
      onChange([...selectedIds, ingredient.id]);
    } else {
      onChange(selectedIds.filter((item) => item !== ingredient.id));
    }
    onToggleIngredient?.(ingredient, selected);
  }

  return (
    <section aria-label="现有食材">
      <h3>现有食材</h3>
      <label>
        搜索食材
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="番茄"
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <ul>
        {ingredients.map((ingredient) => (
          <li key={ingredient.id}>
            <label>
              <input
                type="checkbox"
                checked={selectedIds.includes(ingredient.id)}
                onChange={() => toggle(ingredient)}
              />
              {ingredient.name}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
