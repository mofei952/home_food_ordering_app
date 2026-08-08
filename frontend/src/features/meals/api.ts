import { apiFetch } from "../../api/client";
import type { components } from "../../api/generated";

export type MealSlotRead = components["schemas"]["MealSlotRead"];
export type MenuUpdate = components["schemas"]["MenuUpdate"];
export type MergedMealRequestRead =
  components["schemas"]["MergedMealRequestRead"];
export type MenuItemRead = components["schemas"]["MenuItemRead"];
export type MealType = MealSlotRead["meal_type"];
export type MealSlotStatus = MealSlotRead["status"];

export function getMealSlot(
  localDate: string,
  mealType: MealType,
): Promise<MealSlotRead> {
  return apiFetch(`/api/meal-slots/${localDate}/${mealType}`);
}

export function putMealRequest(
  slotId: string,
  dishId: string,
): Promise<MealSlotRead> {
  return apiFetch(`/api/meal-slots/${slotId}/requests/${dishId}`, {
    method: "PUT",
  });
}

export function deleteMealRequest(
  slotId: string,
  dishId: string,
): Promise<void> {
  return apiFetch(`/api/meal-slots/${slotId}/requests/${dishId}`, {
    method: "DELETE",
  });
}

export function putMealMenu(
  slotId: string,
  body: MenuUpdate,
): Promise<MealSlotRead> {
  return apiFetch(`/api/meal-slots/${slotId}/menu`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export const MEAL_STATUS_LABELS: Record<MealSlotStatus, string> = {
  not_started: "未开始",
  pending: "待确认",
  confirmed: "已确认",
};

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  lunch: "午餐",
  dinner: "晚餐",
};

export function formatLocalDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftLocalDate(isoDate: string, deltaDays: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + deltaDays);
  return formatLocalDate(next);
}

export function todayInTimezone(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function hourInTimezone(timeZone: string, now = new Date()): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .find((part) => part.type === "hour")?.value;
  return Number(hour ?? "0");
}

/** Lunch before 15:00 local household time; dinner otherwise. */
export function defaultMealType(
  timeZone: string,
  now = new Date(),
): MealType {
  return hourInTimezone(timeZone, now) < 15 ? "lunch" : "dinner";
}
