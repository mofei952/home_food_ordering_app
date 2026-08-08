import { apiFetch } from "../../api/client";
import type { components } from "../../api/generated";

export type HistoryEntry = components["schemas"]["HistoryEntry"];
export type MetricsSummary = components["schemas"]["MetricsSummary"];
export type ValidationCheckinRead =
  components["schemas"]["ValidationCheckinRead"];
export type ValidationCheckinWrite =
  components["schemas"]["ValidationCheckinWrite"];
export type EventCreate = components["schemas"]["EventCreate"];

export function getHistory(
  from: string,
  to: string,
): Promise<HistoryEntry[]> {
  const params = new URLSearchParams({ from, to });
  return apiFetch(`/api/history?${params}`);
}

export function getMetricsSummary(
  from: string,
  to: string,
): Promise<MetricsSummary> {
  const params = new URLSearchParams({ from, to });
  return apiFetch(`/api/metrics/summary?${params}`);
}

export function putValidationCheckin(
  weekStart: string,
  body: ValidationCheckinWrite,
): Promise<ValidationCheckinRead> {
  return apiFetch(`/api/validation-checkins/${weekStart}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function postEvent(body: EventCreate): Promise<unknown> {
  return apiFetch("/api/events", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function recordMealOpened(
  mealSlotId: string,
  decisionSource?: "direct" | "random" | "ingredient",
): Promise<unknown> {
  return postEvent({
    name: "meal_opened",
    properties: {
      meal_slot_id: mealSlotId,
      ...(decisionSource ? { decision_source: decisionSource } : {}),
    },
  });
}

/** ISO week Monday (YYYY-MM-DD) for a calendar date in local interpretation. */
export function isoWeekMonday(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay(); // 0 Sun … 6 Sat
  const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setDate(date.getDate() + offset);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatPercent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return "暂无";
  return `${Math.round(ratio * 1000) / 10}%`;
}

export const MEAL_TYPE_LABELS = {
  lunch: "午餐",
  dinner: "晚餐",
} as const;

export const DECISION_SOURCE_LABELS = {
  direct: "直接点菜",
  random: "随机推荐",
  ingredient: "食材匹配",
} as const;
