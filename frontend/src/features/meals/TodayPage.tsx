import { useEffect, useState } from "react";

import { ApiError } from "../../api/client";
import type { components } from "../../api/generated";
import { listDishes, type DishRead } from "../dishes/api";
import { recordMealOpened } from "../history/api";
import {
  deleteMealRequest,
  getMealSlot,
  MEAL_STATUS_LABELS,
  MEAL_TYPE_LABELS,
  putMealMenu,
  putMealRequest,
  shiftLocalDate,
  todayInTimezone,
  type MealSlotRead,
  type MealType,
} from "./api";
import { MealRequests } from "./MealRequests";
import { MenuEditor } from "./MenuEditor";

type SessionResponse = components["schemas"]["SessionResponse"];

interface TodayPageProps {
  session: SessionResponse;
}

export function TodayPage({ session }: TodayPageProps) {
  const [localDate, setLocalDate] = useState(() =>
    todayInTimezone(session.household.timezone),
  );
  const [mealType, setMealType] = useState<MealType>("dinner");
  const [slot, setSlot] = useState<MealSlotRead | null>(null);
  const [dishes, setDishes] = useState<DishRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [conflictMessage, setConflictMessage] = useState<string>();

  async function load(date = localDate, type = mealType) {
    setLoading(true);
    setError(undefined);
    try {
      const [nextSlot, nextDishes] = await Promise.all([
        getMealSlot(date, type),
        listDishes(),
      ]);
      setSlot(nextSlot);
      setDishes(nextDishes);
      void recordMealOpened(nextSlot.id).catch(() => {
        /* non-blocking analytics */
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "加载餐次失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(localDate, mealType);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on date/meal changes only
  }, [localDate, mealType]);

  async function handleRequest(dishId: string) {
    if (!slot) return;
    setError(undefined);
    try {
      const updated = await putMealRequest(slot.id, dishId);
      setSlot(updated);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "点菜失败");
    }
  }

  async function handleWithdraw(dishId: string) {
    if (!slot) return;
    setError(undefined);
    try {
      await deleteMealRequest(slot.id, dishId);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "撤回失败");
    }
  }

  async function handleConfirm(dishIds: string[]) {
    if (!slot) return;
    setError(undefined);
    setConflictMessage(undefined);
    try {
      const updated = await putMealMenu(slot.id, {
        dish_ids: dishIds,
        expected_version: slot.version,
      });
      setSlot(updated);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "version_conflict") {
        setConflictMessage("菜单已被其他成员更新");
        await load();
        return;
      }
      setError(caught instanceof ApiError ? caught.message : "确认菜单失败");
    }
  }

  const dishOptions = dishes.map((dish) => ({ id: dish.id, name: dish.name }));

  return (
    <section>
      <h2>今天</h2>
      <div>
        <button
          type="button"
          aria-label="前一天"
          onClick={() => setLocalDate((current) => shiftLocalDate(current, -1))}
        >
          前一天
        </button>
        <time dateTime={localDate}>{localDate}</time>
        <button
          type="button"
          aria-label="后一天"
          onClick={() => setLocalDate((current) => shiftLocalDate(current, 1))}
        >
          后一天
        </button>
      </div>
      <div role="group" aria-label="餐次">
        {(Object.keys(MEAL_TYPE_LABELS) as MealType[]).map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={mealType === type}
            onClick={() => setMealType(type)}
          >
            {MEAL_TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      {conflictMessage ? (
        <p role="alert" aria-label={conflictMessage}>
          {conflictMessage}
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}

      {loading || !slot ? (
        <p>正在加载…</p>
      ) : (
        <>
          <p aria-label="餐次状态">
            状态：{MEAL_STATUS_LABELS[slot.status]}
          </p>
          {slot.last_modified_by ? (
            <p>
              最后修改：{slot.last_modified_by.nickname}
              {slot.last_modified_at
                ? ` · ${new Date(slot.last_modified_at).toLocaleString("zh-CN")}`
                : ""}
            </p>
          ) : null}

          <MealRequests
            requests={slot.requests}
            currentMemberId={session.member.id}
            onRequest={(dishId) => void handleRequest(dishId)}
            onWithdraw={(dishId) => void handleWithdraw(dishId)}
            dishOptions={dishOptions}
          />

          <MenuEditor
            menu={slot.menu}
            version={slot.version}
            dishOptions={dishOptions}
            onConfirm={handleConfirm}
          />
        </>
      )}
    </section>
  );
}
