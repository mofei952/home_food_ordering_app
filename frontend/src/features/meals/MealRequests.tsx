import { useMemo, useState } from "react";

import type { DishRead } from "../dishes/api";
import { BottomSheet } from "../../ui/BottomSheet";
import { AvatarStack } from "../../ui/MemberAvatar";
import { DishCard } from "../../ui/DishCard";
import type { MergedMealRequestRead } from "./api";

interface MealRequestsProps {
  requests: MergedMealRequestRead[];
  currentMemberId: string;
  dishes: DishRead[];
  onRequest: (dishId: string) => void;
  onWithdraw: (dishId: string) => void;
}

export function MealRequests({
  requests,
  currentMemberId,
  dishes,
  onRequest,
  onWithdraw,
}: MealRequestsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const requestedIds = useMemo(
    () => new Set(requests.map((item) => item.dish_id)),
    [requests],
  );

  const participantCount = useMemo(() => {
    const ids = new Set<string>();
    for (const request of requests) {
      for (const member of request.requested_by) {
        ids.add(member.id);
      }
    }
    return ids.size;
  }, [requests]);

  return (
    <section className="card" aria-label="想吃清单">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.75rem",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "var(--text-title)" }}>想吃</h3>
        <span className="page__lead">
          {requests.length} 道菜 · {participantCount} 人参与
        </span>
      </div>

      {requests.length === 0 ? (
        <div className="empty-state" style={{ padding: "1rem 0" }}>
          <p className="empty-state__title">还没有人点菜</p>
          <p>点一道想吃的，家人会看到你的选择</p>
        </div>
      ) : (
        <div>
          {requests.map((request) => {
            const mine = request.requested_by.some(
              (member) => member.id === currentMemberId,
            );
            const nicknames = request.requested_by.map(
              (member) => member.nickname,
            );
            return (
              <div className="request-card" key={request.dish_id}>
                <div className="request-card__main">
                  <h4 className="request-card__title">{request.dish_name}</h4>
                  <p className="request-card__meta">
                    <AvatarStack nicknames={nicknames} />
                    <span data-testid={`requesters-${request.dish_name}`}>
                      {nicknames.join("、")}
                      {request.requested_by.length > 1
                        ? ` · ×${request.requested_by.length}`
                        : ""}
                    </span>
                  </p>
                </div>
                {mine ? (
                  <button
                    type="button"
                    className="btn--ghost"
                    data-write="true"
                    onClick={() => onWithdraw(request.dish_id)}
                  >
                    撤回
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="btn--soft"
        data-write="true"
        style={{ width: "100%", marginTop: "0.75rem" }}
        onClick={() => setPickerOpen(true)}
      >
        + 想吃的菜
      </button>

      <BottomSheet
        open={pickerOpen}
        title="选择想吃的菜"
        onClose={() => setPickerOpen(false)}
      >
        {dishes.length === 0 ? (
          <p className="page__lead">还没有菜品，请先在「菜品」页录入。</p>
        ) : (
          <div className="dish-grid">
            {dishes.map((dish) => (
              <DishCard
                key={dish.id}
                name={dish.name}
                category={dish.category}
                imageUrl={dish.image_url}
                selectLabel={
                  requestedIds.has(dish.id) ? "已在清单" : "点这道菜"
                }
                onSelect={() => {
                  if (requestedIds.has(dish.id)) return;
                  onRequest(dish.id);
                  setPickerOpen(false);
                }}
              />
            ))}
          </div>
        )}
      </BottomSheet>
    </section>
  );
}
