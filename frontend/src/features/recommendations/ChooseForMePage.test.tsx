import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChooseForMePage } from "./ChooseForMePage";

afterEach(() => {
  vi.unstubAllGlobals();
});

const session = {
  household: {
    id: "h1",
    name: "我家",
    timezone: "Asia/Shanghai",
  },
  member: {
    id: "m1",
    nickname: "小林",
    role: "owner" as const,
    status: "active" as const,
  },
  members: [
    {
      id: "m1",
      nickname: "小林",
      role: "owner" as const,
      status: "active" as const,
    },
    {
      id: "m2",
      nickname: "小周",
      role: "member" as const,
      status: "active" as const,
    },
  ],
};

const ingredients = [
  { id: "i1", name: "番茄", aliases: ["西红柿"] },
  { id: "i2", name: "鸡蛋", aliases: [] },
];

const recommendedDish = {
  id: "d1",
  name: "番茄炒蛋",
  category: "荤菜" as const,
  cooks: [{ id: "m1", nickname: "小林" }],
  ingredients: [
    { id: "i1", name: "番茄" },
    { id: "i2", name: "鸡蛋" },
  ],
  missing_ingredients: [{ id: "i2", name: "鸡蛋" }],
  visibility: "one_missing" as const,
  last_eaten_on: "2026-08-01",
  weight: "0.8",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ChooseForMePage", () => {
  it("groups search results into ready and one-missing sections", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/ingredients")) return jsonResponse(ingredients);
      if (url === "/api/recommendations/search" && init?.method === "POST") {
        return jsonResponse({
          ready: [
            {
              ...recommendedDish,
              id: "d2",
              name: "青菜",
              category: "素菜",
              missing_ingredients: [],
              visibility: "ready",
              last_eaten_on: null,
              weight: "1.0",
              ingredients: [{ id: "i3", name: "青菜" }],
            },
          ],
          one_missing: [recommendedDish],
          meal_slot_id: null,
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ChooseForMePage session={session} />);

    await screen.findByText("番茄");
    fireEvent.click(screen.getByRole("button", { name: "按食材查找" }));

    const ready = await screen.findByRole("region", { name: "现在就能做" });
    expect(within(ready).getByText("青菜")).toBeVisible();
    const oneMissing = screen.getByRole("region", { name: "再补一种即可" });
    expect(within(oneMissing).getByText("番茄炒蛋")).toBeVisible();
    expect(within(oneMissing).getByText("缺少食材：鸡蛋")).toBeVisible();
  });

  it("shows random pick details and reroll / accept actions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/ingredients")) return jsonResponse(ingredients);
      if (url === "/api/recommendations/random" && init?.method === "POST") {
        return jsonResponse({
          dish: {
            ...recommendedDish,
            missing_ingredients: [],
            visibility: "ready",
          },
          meal_slot_id: "slot-1",
        });
      }
      if (
        url === "/api/meal-slots/slot-1/requests/d1" &&
        init?.method === "PUT"
      ) {
        return jsonResponse({ id: "slot-1" });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ChooseForMePage session={session} mealSlotId="slot-1" />);

    await screen.findByText("番茄");
    fireEvent.click(screen.getByRole("button", { name: "随机一道" }));

    const result = await screen.findByRole("region", { name: "随机结果" });
    expect(within(result).getByText("番茄炒蛋")).toBeVisible();
    expect(within(result).getByText("制作者：小林")).toBeVisible();
    expect(within(result).getByText("上次食用：2026-08-01")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "换一道" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          ([url, init]) =>
            String(url) === "/api/recommendations/random" &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toHaveLength(2),
    );

    fireEvent.click(screen.getByRole("button", { name: "就吃这个" }));
    expect(await screen.findByText("已加入点菜：番茄炒蛋")).toBeVisible();
  });

  it("shows relaxable filters when there are no candidates", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/ingredients")) return jsonResponse(ingredients);
      if (url === "/api/recommendations/search") {
        return jsonResponse(
          {
            detail: "没有符合条件的菜品，可尝试放宽：类别、食材",
            code: "no_candidates",
            relaxable_filters: ["categories", "available_ingredient_ids"],
          },
          404,
        );
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ChooseForMePage session={session} />);
    await screen.findByText("番茄");
    fireEvent.click(screen.getByRole("checkbox", { name: "汤" }));
    fireEvent.click(screen.getByRole("button", { name: "按食材查找" }));

    expect(
      await screen.findByText("没有符合条件的菜品，可尝试放宽：类别、食材"),
    ).toBeVisible();
    expect(screen.getByText("可放宽：类别、食材")).toBeVisible();
  });
});
