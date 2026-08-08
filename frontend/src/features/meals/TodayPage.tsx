import { useEffect, useState } from "react";

import { ApiError } from "../../api/client";
import type { components } from "../../api/generated";
import { useToast } from "../../ui/Toast";
import { IconChevronLeft, IconChevronRight } from "../../ui/icons";
import { SegmentedControl } from "../../ui/SegmentedControl";
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

function formatDateHeading(localDate: string): { primary: string; secondary: string } {
  const date = new Date(`${localDate}T12:00:00`);
  const primary = date.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  return { primary, secondary: localDate };
}

export function TodayPage({ session }: TodayPageProps) {
  const { push: toast } = useToast();
  const [localDate, setLocalDate] = useState(() =>
    todayInTimezone(session.household.timezone),
  );
  const [mealType, setMealType] = useState<MealType>("dinner");
  const [slot, setSlot] = useState<MealSlotRead | null>(null);
  const [dishes, setDishes] = useState<DishRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [conflictMessage, setConflictMessage] = useState<string>();
  const [section, setSection] = useState<"order" | "menu">("order");

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
      toast("已加入想吃清单");
      void recordMealOpened(slot.id, "direct").catch(() => {
        /* non-blocking analytics */
      });
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
      toast("已撤回");
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
      toast(confirmed ? "菜单已更新" : "菜单已确认");
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "version_conflict") {
        setConflictMessage("菜单已被其他成员更新");
        toast("菜单已被其他成员更新", "error");
        await load();
        return;
      }
      setError(caught instanceof ApiError ? caught.message : "确认菜单失败");
      toast(
        caught instanceof ApiError ? caught.message : "确认菜单失败",
        "error",
      );
    }
  }

  const dishOptions = dishes.map((dish) => ({ id: dish.id, name: dish.name }));
  const dateHeading = formatDateHeading(localDate);
  const confirmed = slot?.status === "confirmed";

  return (
    <div className="page">
      <div className="sticky-toolbar">
        <div className="date-nav">
          <button
            type="button"
            className="btn--ghost btn--icon"
            aria-label="前一天"
            onClick={() => setLocalDate((current) => shiftLocalDate(current, -1))}
          >
            <IconChevronLeft />
          </button>
          <div>
            <p className="date-nav__label">{dateHeading.primary}</p>
            <time dateTime={localDate}>{dateHeading.secondary}</time>
          </div>
          <button
            type="button"
            className="btn--ghost btn--icon"
            aria-label="后一天"
            onClick={() => setLocalDate((current) => shiftLocalDate(current, 1))}
          >
            <IconChevronRight />
          </button>
        </div>
        <SegmentedControl
          aria-label="餐次"
          value={mealType}
          onChange={setMealType}
          options={(Object.keys(MEAL_TYPE_LABELS) as MealType[]).map((type) => ({
            value: type,
            label: MEAL_TYPE_LABELS[type],
          }))}
        />
      </div>

      {conflictMessage ? (
        <p className="alert-inline" role="alert" aria-label={conflictMessage}>
          {conflictMessage}
        </p>
      ) : null}
      {error ? (
        <p className="alert-inline" role="alert">
          {error}
        </p>
      ) : null}

      {loading || !slot ? (
        <div className="skeleton" style={{ height: "8rem" }} aria-busy="true" />
      ) : (
        <>
          <div
            className={
              confirmed
                ? "card card--status-confirmed"
                : "card card--status-draft"
            }
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span
                className={confirmed ? "badge badge--confirmed" : "badge badge--draft"}
                aria-label="餐次状态"
              >
                {MEAL_STATUS_LABELS[slot.status]}
              </span>
              {slot.last_modified_by ? (
                <p className="page__lead" style={{ margin: 0, textAlign: "right" }}>
                  {slot.last_modified_by.nickname}
                  {slot.last_modified_at
                    ? ` · ${new Date(slot.last_modified_at).toLocaleString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : ""}
                </p>
              ) : null}
            </div>
          </div>

          <div className="page-section-tabs">
            <SegmentedControl
              aria-label="今天的工作区"
              value={section}
              onChange={setSection}
              options={[
                { value: "order", label: "点菜" },
                { value: "menu", label: "确认菜单" },
              ]}
            />
          </div>

          {section === "order" ? (
            <MealRequests
              requests={slot.requests}
              currentMemberId={session.member.id}
              dishes={dishes}
              onRequest={(dishId) => void handleRequest(dishId)}
              onWithdraw={(dishId) => void handleWithdraw(dishId)}
            />
          ) : (
            <MenuEditor
              menu={slot.menu}
              version={slot.version}
              dishOptions={dishOptions}
              confirmed={confirmed}
              onConfirm={handleConfirm}
            />
          )}
        </>
      )}
    </div>
  );
}
