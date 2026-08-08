import { apiFetch } from "../../api/client";
import type { components } from "../../api/generated";

export type RecommendationFilters = {
  cookIds: string[];
  categories: string[];
  availableIngredientIds: string[];
  mealSlotId: string | null;
};

export type RecommendedDishRead =
  components["schemas"]["RecommendedDishRead"];
export type SearchResponse = components["schemas"]["SearchResponse"];
export type RandomResponse = components["schemas"]["RandomResponse"];

function toBody(filters: RecommendationFilters, seed?: number | null) {
  return {
    cook_ids: filters.cookIds,
    categories: filters.categories,
    available_ingredient_ids: filters.availableIngredientIds,
    meal_slot_id: filters.mealSlotId,
    ...(seed === undefined ? {} : { seed }),
  };
}

export function searchRecommendations(
  filters: RecommendationFilters,
): Promise<SearchResponse> {
  return apiFetch("/api/recommendations/search", {
    method: "POST",
    body: JSON.stringify(toBody(filters)),
  });
}

export function randomRecommendation(
  filters: RecommendationFilters,
  seed?: number | null,
): Promise<RandomResponse> {
  return apiFetch("/api/recommendations/random", {
    method: "POST",
    body: JSON.stringify(toBody(filters, seed)),
  });
}

export const FILTER_LABELS: Record<string, string> = {
  cook_ids: "制作者",
  categories: "类别",
  available_ingredient_ids: "食材",
};
