import { apiFetch } from "../../api/client";
import type { components } from "../../api/generated";
import type { DishInput } from "./DishForm";

export type DishRead = components["schemas"]["DishRead"];
export type IngredientRead = components["schemas"]["IngredientRead"];
export type DishWriteBody = components["schemas"]["DishCreate"];

export type DishListFilters = {
  cookId?: string;
  category?: DishRead["category"] | "";
};

export function toDishWriteBody(input: DishInput): DishWriteBody {
  return {
    name: input.name,
    category: input.category,
    cook_ids: input.cookIds,
    ingredients: input.ingredients,
    image_key: input.imageKey,
  };
}

function dishesPath(filters: DishListFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.cookId) params.set("cook_id", filters.cookId);
  if (filters.category) params.set("category", filters.category);
  const query = params.toString();
  return query ? `/api/dishes?${query}` : "/api/dishes";
}

export function listDishes(filters: DishListFilters = {}): Promise<DishRead[]> {
  return apiFetch(dishesPath(filters));
}

export function createDish(input: DishInput): Promise<DishRead> {
  return apiFetch("/api/dishes", {
    method: "POST",
    body: JSON.stringify(toDishWriteBody(input)),
  });
}

export function updateDish(dishId: string, input: DishInput): Promise<DishRead> {
  return apiFetch(`/api/dishes/${dishId}`, {
    method: "PATCH",
    body: JSON.stringify(toDishWriteBody(input)),
  });
}

export function archiveDish(dishId: string): Promise<DishRead> {
  return apiFetch(`/api/dishes/${dishId}`, { method: "DELETE" });
}

export function searchIngredients(query?: string): Promise<IngredientRead[]> {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  const suffix = params.toString();
  return apiFetch(suffix ? `/api/ingredients?${suffix}` : "/api/ingredients");
}
