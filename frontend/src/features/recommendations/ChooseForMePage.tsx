import { useState } from "react";

import { ApiError } from "../../api/client";
import type { components } from "../../api/generated";
import { putMealRequest } from "../meals/api";
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
  const [cookIds, setCookIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [availableIngredientIds, setAvailableIngredientIds] = useState<
    string[]
  >([]);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [picked, setPicked] = useState<RecommendedDishRead | null>(null);
  const [error, setError] = useState<string>();
  const [relaxable, setRelaxable] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [acceptedMessage, setAcceptedMessage] = useState<string>();

  function currentFilters(): RecommendationFilters {
    return {
      cookIds,
      categories,
      availableIngredientIds,
      mealSlotId,
    };
  }

  function toggleValue(list: string[], value: string): string[] {
    return list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
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
    if (!mealSlotId) {
      setAcceptedMessage(`已选中：${picked.name}`);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await putMealRequest(mealSlotId, picked.id);
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
          <p>匹配条件：制作者 / 类别 / 现有食材</p>
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
