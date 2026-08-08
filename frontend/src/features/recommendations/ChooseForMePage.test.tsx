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

function slotResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "slot-1",
    local_date: "2026-08-10",
    meal_type: "dinner",
    status: "pending",
    version: 0,
    requests: [],
    menu: [],
    last_modified_by: null,
    last_modified_at: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isMealSlotLookup(url: string): boolean {
  return /\/api\/meal-slots\/\d{4}-\d{2}-\d{2}\/(lunch|dinner)$/.test(url);
}

describe("ChooseForMePage", () => {
  it("groups search results into ready and one-missing sections", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/ingredients")) return jsonResponse(ingredients);
      if (isMealSlotLookup(url)) {
        return jsonResponse(
          slotResponse({
            meal_type: url.endsWith("/lunch") ? "lunch" : "dinner",
          }),
        );
      }
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

  it("resolves today's meal slot and accepts a pick into that meal", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/ingredients")) return jsonResponse(ingredients);
      if (isMealSlotLookup(url)) {
        return jsonResponse(
          slotResponse({
            id: "slot-resolved",
            meal_type: url.endsWith("/lunch") ? "lunch" : "dinner",
          }),
        );
      }
      if (url === "/api/recommendations/random" && init?.method === "POST") {
        return jsonResponse({
          dish: {
            ...recommendedDish,
            missing_ingredients: [],
            visibility: "ready",
          },
          meal_slot_id: "slot-resolved",
        });
      }
      if (
        url === "/api/meal-slots/slot-resolved/requests/d1" &&
        init?.method === "PUT"
      ) {
        return jsonResponse(slotResponse({ id: "slot-resolved" }));
      }
      if (url === "/api/events" && init?.method === "POST") {
        return jsonResponse({ id: "evt-1" }, 201);
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ChooseForMePage session={session} />);

    await screen.findByText("番茄");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/meal-slots\/\d{4}-\d{2}-\d{2}\/(lunch|dinner)$/),
        expect.objectContaining({ credentials: "include" }),
      ),
    );

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
    expect(await screen.findByText("已加入今晚想吃清单")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/meal-slots/slot-resolved/requests/d1",
      expect.objectContaining({ method: "PUT" }),
    );
    await waitFor(() => {
      const eventBodies = fetchMock.mock.calls
        .filter(
          ([url, init]) =>
            String(url) === "/api/events" &&
            (init as RequestInit | undefined)?.method === "POST",
        )
        .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
      expect(eventBodies).toContainEqual({
        name: "meal_opened",
        properties: {
          meal_slot_id: "slot-resolved",
          decision_source: "random",
        },
      });
    });
  });

  it("adds from ingredient search with decision_source=ingredient", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/ingredients")) return jsonResponse(ingredients);
      if (isMealSlotLookup(url)) {
        return jsonResponse(
          slotResponse({
            id: "slot-search",
            meal_type: url.endsWith("/lunch") ? "lunch" : "dinner",
          }),
        );
      }
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
          meal_slot_id: "slot-search",
        });
      }
      if (
        url === "/api/meal-slots/slot-search/requests/d2" &&
        init?.method === "PUT"
      ) {
        return jsonResponse(slotResponse({ id: "slot-search" }));
      }
      if (url === "/api/events" && init?.method === "POST") {
        return jsonResponse({ id: "evt-1" }, 201);
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ChooseForMePage session={session} />);
    await screen.findByText("番茄");
    fireEvent.click(screen.getByRole("button", { name: "按食材查找" }));

    const ready = await screen.findByRole("region", { name: "现在就能做" });
    fireEvent.click(within(ready).getByRole("button", { name: "加入点菜" }));

    expect(await screen.findByText("已加入今晚想吃清单")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/meal-slots/slot-search/requests/d2",
      expect.objectContaining({ method: "PUT" }),
    );
    await waitFor(() => {
      const eventBodies = fetchMock.mock.calls
        .filter(
          ([url, init]) =>
            String(url) === "/api/events" &&
            (init as RequestInit | undefined)?.method === "POST",
        )
        .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
      expect(eventBodies).toContainEqual({
        name: "meal_opened",
        properties: {
          meal_slot_id: "slot-search",
          decision_source: "ingredient",
        },
      });
    });
  });

  it("shows active filters in random match conditions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/ingredients")) return jsonResponse(ingredients);
      if (isMealSlotLookup(url)) return jsonResponse(slotResponse());
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
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ChooseForMePage session={session} />);

    await screen.findByText("番茄");
    fireEvent.click(screen.getByRole("checkbox", { name: "小林" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "素菜" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "番茄" }));
    fireEvent.click(screen.getByRole("button", { name: "随机一道" }));

    const result = await screen.findByRole("region", { name: "随机结果" });
    expect(
      within(result).getByText("匹配条件：制作者：小林；类别：素菜；现有食材：番茄"),
    ).toBeVisible();
  });

  it("shows meal type toggle for lunch and dinner", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/ingredients")) return jsonResponse(ingredients);
      if (isMealSlotLookup(url)) {
        return jsonResponse(
          slotResponse({
            meal_type: url.endsWith("/lunch") ? "lunch" : "dinner",
          }),
        );
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ChooseForMePage session={session} />);

    const lunch = await screen.findByRole("button", { name: "午餐" });
    const dinner = screen.getByRole("button", { name: "晚餐" });
    expect(lunch).toBeVisible();
    expect(dinner).toBeVisible();

    const switchToDinner = lunch.getAttribute("aria-pressed") === "true";
    fireEvent.click(switchToDinner ? dinner : lunch);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(
          switchToDinner
            ? /\/api\/meal-slots\/\d{4}-\d{2}-\d{2}\/dinner$/
            : /\/api\/meal-slots\/\d{4}-\d{2}-\d{2}\/lunch$/,
        ),
        expect.objectContaining({ credentials: "include" }),
      ),
    );
  });

  it("shows relaxable filters when there are no candidates", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/ingredients")) return jsonResponse(ingredients);
      if (isMealSlotLookup(url)) return jsonResponse(slotResponse());
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
