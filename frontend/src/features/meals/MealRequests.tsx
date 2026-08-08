import type { MergedMealRequestRead } from "./api";

interface MealRequestsProps {
  requests: MergedMealRequestRead[];
  currentMemberId: string;
  onRequest: (dishId: string) => void;
  onWithdraw: (dishId: string) => void;
  dishOptions: Array<{ id: string; name: string }>;
}

export function MealRequests({
  requests,
  currentMemberId,
  onRequest,
  onWithdraw,
  dishOptions,
}: MealRequestsProps) {
  const requestedIds = new Set(requests.map((item) => item.dish_id));

  return (
    <section aria-label="想吃清单">
      <h3>想吃清单</h3>
      {requests.length === 0 ? (
        <p>还没有人点菜。</p>
      ) : (
        <ul>
          {requests.map((request) => {
            const mine = request.requested_by.some(
              (member) => member.id === currentMemberId,
            );
            return (
              <li key={request.dish_id}>
                <article>
                  <h4>{request.dish_name}</h4>
                  <p>
                    点菜人：
                    {request.requested_by
                      .map((member) => member.nickname)
                      .join("、")}
                  </p>
                  {mine ? (
                    <button
                      type="button"
                      data-write="true"
                      onClick={() => onWithdraw(request.dish_id)}
                    >
                      撤回
                    </button>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <label>
        点一道菜
        <select
          aria-label="点一道菜"
          defaultValue=""
          onChange={(event) => {
            const dishId = event.target.value;
            if (dishId) {
              onRequest(dishId);
              event.target.value = "";
            }
          }}
        >
          <option value="">选择菜品</option>
          {dishOptions.map((dish) => (
            <option key={dish.id} value={dish.id}>
              {dish.name}
              {requestedIds.has(dish.id) ? "（已在清单）" : ""}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
