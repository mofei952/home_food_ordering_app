import { useEffect, useState } from "react";

import { ApiError } from "../../api/client";
import type { components } from "../../api/generated";
import { Chip } from "../../ui/Chip";
import { DishCard } from "../../ui/DishCard";
import { SegmentedControl } from "../../ui/SegmentedControl";
import { useToast } from "../../ui/Toast";
import { recordMealOpened } from "../history/api";
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

type Tab = "random" | "ingredient";

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

function DishResult({
  dish,
  onAdd,
  busy = false,
  addLabel = "加入点菜",
  variant = "ready",
}: {
  dish: RecommendedDishRead;
  onAdd?: (dish: RecommendedDishRead) => void;
  busy?: boolean;
  addLabel?: string;
  variant?: "ready" | "missing";
}) {
  return (
    <article
      className={
        variant === "missing"
          ? "card result-card result-card--missing"
          : "card result-card"
      }
    >
      <h4 style={{ margin: "0 0 0.5rem" }}>{dish.name}</h4>
      <p className="page__lead" style={{ margin: "0 0 0.25rem" }}>
        {dish.category} · {formatCooks(dish)}
      </p>
      <p className="page__lead" style={{ margin: 0 }}>
        食材：{formatIngredients(dish.ingredients)}
      </p>
      {dish.missing_ingredients.length > 0 ? (
        <p className="page__lead" style={{ margin: "0.35rem 0 0" }}>
          缺少：{formatIngredients(dish.missing_ingredients)}
        </p>
      ) : null}
      {onAdd ? (
        <button
          type="button"
          className="btn--soft"
          style={{ width: "100%", marginTop: "0.75rem" }}
          data-write="true"
          disabled={busy}
          onClick={() => onAdd(dish)}
        >
          {addLabel}
        </button>
      ) : null}
    </article>
  );
}

export function ChooseForMePage({
  session,
  mealSlotId = null,
}: ChooseForMePageProps) {
  const { push: toast } = useToast();
  const [tab, setTab] = useState<Tab>("random");
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
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setFiltersOpen(tab === "ingredient");
  }, [tab]);

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

  async function acceptDish(
    dish: RecommendedDishRead,
    decisionSource: "random" | "ingredient",
  ) {
    setBusy(true);
    setError(undefined);
    try {
      const slotId = await ensureMealSlotId();
      if (!slotId) {
        setError("无法确定当前餐次，请稍后重试");
        return;
      }
      await putMealRequest(slotId, dish.id);
      void recordMealOpened(slotId, decisionSource).catch(() => {});
      toast("已加入今晚想吃清单");
      setPicked(dish);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "加入点菜失败");
    } finally {
      setBusy(false);
    }
  }

  const filterSection = (
    <>
      <SegmentedControl
        aria-label="餐次"
        value={mealType}
        disabled={busy || mealSlotId != null}
        onChange={setMealType}
        options={(["lunch", "dinner"] as const).map((type) => ({
          value: type,
          label: MEAL_TYPE_LABELS[type],
        }))}
      />
      <div>
        <p className="page__lead">制作者</p>
        <div className="chip-row">
          {session.members
            .filter((member) => member.status === "active")
            .map((member) => (
              <Chip
                key={member.id}
                selected={cookIds.includes(member.id)}
                onClick={() =>
                  setCookIds(toggleValue(cookIds, member.id))
                }
              >
                {member.nickname}
              </Chip>
            ))}
        </div>
      </div>
      <div>
        <p className="page__lead">类别</p>
        <div className="chip-row">
          {CATEGORIES.map((category) => (
            <Chip
              key={category}
              selected={categories.includes(category)}
              onClick={() =>
                setCategories(toggleValue(categories, category))
              }
            >
              {category}
            </Chip>
          ))}
        </div>
      </div>
    </>
  );

  const filtersPanel = (
    <div className="card filters-panel">
      <button
        type="button"
        className="btn--ghost filters-panel__toggle"
        aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen((open) => !open)}
      >
        {filtersOpen ? "收起筛选条件" : "展开筛选条件（餐次、制作者、类别）"}
      </button>
      {filtersOpen ? (
        <div className="filters-panel__body">{filterSection}</div>
      ) : null}
    </div>
  );

  return (
    <div className="page" aria-label="帮我选">
      <SegmentedControl
        aria-label="帮我选模式"
        value={tab}
        onChange={setTab}
        options={[
          { value: "random", label: "随机一道" },
          { value: "ingredient", label: "按食材找" },
        ]}
      />

      {error ? (
        <div className="alert-inline" role="alert">
          <p style={{ margin: 0 }}>{error}</p>
          {relaxable.length > 0 ? (
            <p style={{ margin: "0.35rem 0 0" }}>
              可放宽：
              {relaxable.map((key) => FILTER_LABELS[key] ?? key).join("、")}
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "random" ? (
        <div className="choose-panel">
          {filtersPanel}
          {filtersOpen ? (
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
          ) : null}
          <div className="random-stage">
            {picked ? (
              <div className="random-stage__card" style={{ width: "100%" }}>
                <section aria-label="随机结果">
                  <div data-testid="selected-dish" data-dish-id={picked.id}>
                    <DishCard
                      name={picked.name}
                      category={picked.category}
                      subtitle={`${formatCooks(picked)} · ${formatIngredients(picked.ingredients)}`}
                    />
                  </div>
                  <div className="form-actions" style={{ marginTop: "0.75rem" }}>
                    <button
                      type="button"
                      data-write="true"
                      disabled={busy}
                      onClick={() => void acceptDish(picked, "random")}
                    >
                      就吃这个
                    </button>
                    <button
                      type="button"
                      className="btn--ghost"
                      disabled={busy}
                      onClick={() => void handleRandom()}
                    >
                      换一道
                    </button>
                  </div>
                </section>
              </div>
            ) : (
              <div className="card" style={{ width: "100%", textAlign: "center" }}>
                <p className="page__lead">选好筛选条件，让应用帮你想一道</p>
                <button
                  type="button"
                  disabled={busy}
                  aria-label="开始随机"
                  onClick={() => void handleRandom()}
                >
                  随机一道
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="choose-panel">
          {filtersPanel}
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
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSearch()}
          >
            按食材查找
          </button>

          {results ? (
            <>
              <section aria-label="现在就能做">
                <h3 style={{ fontSize: "var(--text-title)" }}>现在就能做</h3>
                {results.ready.length === 0 ? (
                  <p className="page__lead">暂无</p>
                ) : (
                  results.ready.map((dish) => (
                    <DishResult
                      key={dish.id}
                      dish={dish}
                      busy={busy}
                      onAdd={(item) => void acceptDish(item, "ingredient")}
                    />
                  ))
                )}
              </section>
              <section aria-label="再补一种即可">
                <h3 style={{ fontSize: "var(--text-title)" }}>再补一种即可</h3>
                {results.one_missing.length === 0 ? (
                  <p className="page__lead">暂无</p>
                ) : (
                  results.one_missing.map((dish) => (
                    <DishResult
                      key={dish.id}
                      dish={dish}
                      variant="missing"
                      busy={busy}
                      onAdd={(item) => void acceptDish(item, "ingredient")}
                    />
                  ))
                )}
              </section>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
