import { useEffect, useState } from "react";

import { ApiError } from "../../api/client";
import type { components } from "../../api/generated";
import {
  defaultMealType,
  getMealSlot,
  MEAL_TYPE_LABELS,
  putMealRequest,
  todayInTimezone,
  type MealType,
} from "../meals/api";
import {
  FILTER_LABELS,
  randomRecommendation,
  searchRecommendations,
  type RecommendationFilters,
  type RecommendedDishRead,
  type SearchResponse,
} from "./api";
import { IngredientPicker } from "./IngredientPicker";

type SessionResponse = components["schemas"]["SessionResponse"];
type DishCategory = components["schemas"]["DishCreate"]["category"];

const CATEGORIES: DishCategory[] = ["荤菜", "素菜", "主食", "汤", "其他"];

interface ChooseForMePageProps {
  session: SessionResponse;
  /** Optional override; when omitted the page resolves today's slot itself. */
  mealSlotId?: string | null;
}

function formatCooks(dish: RecommendedDishRead): string {
  return dish.cooks.map((cook) => cook.nickname).join("、") || "未指定";
}

function formatIngredients(
  items: RecommendedDishRead["ingredients"],
): string {
  return items.map((item) => item.name).join("、") || "无";
}

function DishResult({ dish }: { dish: RecommendedDishRead }) {
  return (
    <article>
      <h4>{dish.name}</h4>
      <p>类别：{dish.category}</p>
      <p>制作者：{formatCooks(dish)}</p>
      <p>食材：{formatIngredients(dish.ingredients)}</p>
      {dish.missing_ingredients.length > 0 ? (
        <p>缺少食材：{formatIngredients(dish.missing_ingredients)}</p>
      ) : null}
      <p>
        上次食用：
        {dish.last_eaten_on ?? "从未吃过"}
      </p>
    </article>
  );
}

export function ChooseForMePage({
  session,
  mealSlotId = null,
}: ChooseForMePageProps) {
  const [mealType, setMealType] = useState<MealType>(() =>
    defaultMealType(session.household.timezone),
  );
  const [resolvedMealSlotId, setResolvedMealSlotId] = useState<string | null>(
    mealSlotId,
  );
  const [cookIds, setCookIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [availableIngredientIds, setAvailableIngredientIds] = useState<
    string[]
  >([]);
  const [ingredientNames, setIngredientNames] = useState<
    Record<string, string>
  >({});
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [picked, setPicked] = useState<RecommendedDishRead | null>(null);
  const [error, setError] = useState<string>();
  const [relaxable, setRelaxable] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [acceptedMessage, setAcceptedMessage] = useState<string>();

  useEffect(() => {
    if (mealSlotId) {
      setResolvedMealSlotId(mealSlotId);
      return;
    }
    let cancelled = false;
    const localDate = todayInTimezone(session.household.timezone);
    void getMealSlot(localDate, mealType)
      .then((slot) => {
        if (!cancelled) setResolvedMealSlotId(slot.id);
      })
      .catch((caught) => {
        if (!cancelled) {
          setResolvedMealSlotId(null);
          setError(
            caught instanceof ApiError ? caught.message : "加载餐次失败",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mealSlotId, mealType, session.household.timezone]);

  function currentFilters(): RecommendationFilters {
    return {
      cookIds,
      categories,
      availableIngredientIds,
      mealSlotId: resolvedMealSlotId,
    };
  }

  function formatActiveFilters(): string {
    const parts: string[] = [];
    if (cookIds.length > 0) {
      const names = session.members
        .filter((member) => cookIds.includes(member.id))
        .map((member) => member.nickname);
      parts.push(`制作者：${names.join("、")}`);
    }
    if (categories.length > 0) {
      parts.push(`类别：${categories.join("、")}`);
    }
    if (availableIngredientIds.length > 0) {
      const names = availableIngredientIds.map(
        (id) => ingredientNames[id] ?? id,
      );
      parts.push(`现有食材：${names.join("、")}`);
    }
    return parts.length > 0 ? parts.join("；") : "无";
  }

  function toggleValue(list: string[], value: string): string[] {
    return list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
  }

  async function ensureMealSlotId(): Promise<string | null> {
    if (resolvedMealSlotId) return resolvedMealSlotId;
    if (mealSlotId) return mealSlotId;
    try {
      const localDate = todayInTimezone(session.household.timezone);
      const slot = await getMealSlot(localDate, mealType);
      setResolvedMealSlotId(slot.id);
      return slot.id;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "加载餐次失败");
      return null;
    }
  }

  async function handleSearch() {
    setBusy(true);
    setError(undefined);
    setRelaxable([]);
    setAcceptedMessage(undefined);
    try {
      const response = await searchRecommendations(currentFilters());
      setResults(response);
      setPicked(null);
    } catch (caught) {
      setResults(null);
      if (caught instanceof ApiError) {
        setError(caught.message);
        setRelaxable(caught.relaxableFilters ?? []);
      } else {
        setError("搜索失败");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRandom(seed?: number) {
    setBusy(true);
    setError(undefined);
    setRelaxable([]);
    setAcceptedMessage(undefined);
    try {
      const response = await randomRecommendation(currentFilters(), seed);
      setPicked(response.dish);
    } catch (caught) {
      setPicked(null);
      if (caught instanceof ApiError) {
        setError(caught.message);
        setRelaxable(caught.relaxableFilters ?? []);
      } else {
        setError("随机失败");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept() {
    if (!picked) return;
    setBusy(true);
    setError(undefined);
    try {
      const slotId = await ensureMealSlotId();
      if (!slotId) {
        setError("无法确定当前餐次，请稍后重试");
        return;
      }
      await putMealRequest(slotId, picked.id);
      setAcceptedMessage(`已加入点菜：${picked.name}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "加入点菜失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="帮我选">
      <h2>帮我选</h2>

      <fieldset>
        <legend>餐次</legend>
        {(["lunch", "dinner"] as const).map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={mealType === type}
            disabled={busy || mealSlotId != null}
            onClick={() => setMealType(type)}
          >
            {MEAL_TYPE_LABELS[type]}
          </button>
        ))}
      </fieldset>

      <fieldset>
        <legend>制作者</legend>
        {session.members
          .filter((member) => member.status === "active")
          .map((member) => (
            <label key={member.id}>
              <input
                type="checkbox"
                checked={cookIds.includes(member.id)}
                onChange={() => setCookIds(toggleValue(cookIds, member.id))}
              />
              {member.nickname}
            </label>
          ))}
      </fieldset>

      <fieldset>
        <legend>类别</legend>
        {CATEGORIES.map((category) => (
          <label key={category}>
            <input
              type="checkbox"
              checked={categories.includes(category)}
              onChange={() =>
                setCategories(toggleValue(categories, category))
              }
            />
            {category}
          </label>
        ))}
      </fieldset>

      <IngredientPicker
        selectedIds={availableIngredientIds}
        onChange={setAvailableIngredientIds}
        onToggleIngredient={(ingredient, selected) => {
          setIngredientNames((current) => {
            if (selected) {
              return { ...current, [ingredient.id]: ingredient.name };
            }
            const next = { ...current };
            delete next[ingredient.id];
            return next;
          });
        }}
      />

      <div>
        <button type="button" disabled={busy} onClick={() => void handleSearch()}>
          按食材查找
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleRandom()}
        >
          随机一道
        </button>
      </div>

      {error ? (
        <div role="alert">
          <p>{error}</p>
          {relaxable.length > 0 ? (
            <p>
              可放宽：
              {relaxable.map((key) => FILTER_LABELS[key] ?? key).join("、")}
            </p>
          ) : null}
        </div>
      ) : null}

      {acceptedMessage ? <p>{acceptedMessage}</p> : null}

      {picked ? (
        <section aria-label="随机结果">
          <h3>随机结果</h3>
          <DishResult dish={picked} />
          <p>匹配条件：{formatActiveFilters()}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleAccept()}
          >
            就吃这个
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRandom()}
          >
            换一道
          </button>
        </section>
      ) : null}

      {results ? (
        <>
          <section aria-label="现在就能做">
            <h3>现在就能做</h3>
            {results.ready.length === 0 ? (
              <p>暂无</p>
            ) : (
              results.ready.map((dish) => (
                <DishResult key={dish.id} dish={dish} />
              ))
            )}
          </section>
          <section aria-label="再补一种即可">
            <h3>再补一种即可</h3>
            {results.one_missing.length === 0 ? (
              <p>暂无</p>
            ) : (
              results.one_missing.map((dish) => (
                <DishResult key={dish.id} dish={dish} />
              ))
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
