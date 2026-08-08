import { useEffect, useState } from "react";

import { ApiError } from "../../api/client";
import { searchIngredients, type IngredientRead } from "../dishes/api";

interface IngredientPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function IngredientPicker({
  selectedIds,
  onChange,
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

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
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
                onChange={() => toggle(ingredient.id)}
              />
              {ingredient.name}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
