import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TodayPage } from "./TodayPage";

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

const dishes = [
  {
    id: "d1",
    name: "番茄炒蛋",
    category: "荤菜" as const,
    cooks: [{ id: "m1", nickname: "小林" }],
    ingredients: [
      { id: "i1", name: "番茄" },
      { id: "i2", name: "鸡蛋" },
    ],
    image_url: null,
    archived_at: null,
    updated_by: { id: "m1", nickname: "小林" },
    updated_at: "2026-08-08T00:00:00Z",
  },
];

function slotResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "slot-1",
    local_date: "2026-08-10",
    meal_type: "dinner",
    status: "pending",
    version: 0,
    requests: [
      {
        dish_id: "d1",
        dish_name: "番茄炒蛋",
        image_key: null,
        requested_by: [
          { id: "m1", nickname: "小林" },
          { id: "m2", nickname: "小周" },
        ],
      },
    ],
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

describe("TodayPage", () => {
  it("shows date switcher, meal toggle, Chinese status and merged requesters", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/dishes")) return jsonResponse(dishes);
      if (url.includes("/api/meal-slots/")) {
        return jsonResponse(
          slotResponse({
            meal_type: url.includes("/lunch") ? "lunch" : "dinner",
          }),
        );
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TodayPage session={session} />);

    expect(await screen.findByRole("heading", { name: "今天" })).toBeVisible();
    expect(screen.getByRole("button", { name: "午餐" })).toBeVisible();
    expect(screen.getByRole("button", { name: "晚餐" })).toBeVisible();
    expect(screen.getByLabelText("餐次状态")).toHaveTextContent("待确认");
    expect(screen.getByText("点菜人：小林、小周")).toBeVisible();

    const beforeDate = screen.getByRole("time").getAttribute("dateTime");
    expect(beforeDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    fireEvent.click(screen.getByRole("button", { name: "前一天" }));
    await waitFor(() => {
      expect(screen.getByRole("time").getAttribute("dateTime")).not.toEqual(
        beforeDate,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "午餐" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/meal-slots\/\d{4}-\d{2}-\d{2}\/lunch$/),
        expect.objectContaining({ credentials: "include" }),
      ),
    );
    expect(screen.getByRole("button", { name: "午餐" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows conflict banner and refreshes after version conflict", async () => {
    let menuPutSeen = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/dishes")) return jsonResponse(dishes);
      if (url.includes("/menu") && init?.method === "PUT") {
        menuPutSeen = true;
        return jsonResponse(
          {
            detail: "菜单已被其他成员更新",
            code: "version_conflict",
            current_version: 1,
          },
          409,
        );
      }
      if (url.includes("/api/meal-slots/")) {
        if (menuPutSeen) {
          return jsonResponse(
            slotResponse({
              status: "confirmed",
              version: 1,
              menu: [
                {
                  dish_id: "d1",
                  dish_name: "番茄炒蛋",
                  image_key: null,
                },
              ],
              last_modified_by: { id: "m2", nickname: "小周" },
              last_modified_at: "2026-08-10T04:00:00Z",
            }),
          );
        }
        return jsonResponse(slotResponse());
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TodayPage session={session} />);
    await screen.findByLabelText("餐次状态");

    fireEvent.click(screen.getByRole("button", { name: "确认菜单" }));

    expect(
      await screen.findByRole("alert", { name: "菜单已被其他成员更新" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByLabelText("餐次状态")).toHaveTextContent("已确认"),
    );
  });
});
