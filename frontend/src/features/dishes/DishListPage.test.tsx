import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DishForm, type DishInput } from "./DishForm";
import { DishListPage } from "./DishListPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

const members = [
  { id: "m1", nickname: "小林", role: "owner" as const, status: "active" as const },
  { id: "m2", nickname: "小周", role: "member" as const, status: "active" as const },
];

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
  {
    id: "d2",
    name: "青菜",
    category: "素菜" as const,
    cooks: [{ id: "m2", nickname: "小周" }],
    ingredients: [{ id: "i3", name: "青菜" }],
    image_url: null,
    archived_at: null,
    updated_by: { id: "m2", nickname: "小周" },
    updated_at: "2026-08-08T00:00:00Z",
  },
];

describe("DishListPage", () => {
  it("lists dish name, category, cooks and ingredients", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(dishes), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<DishListPage members={members} />);

    const tomatoEgg = await screen.findByText("番茄炒蛋");
    expect(tomatoEgg).toBeVisible();
    const tomatoCard = tomatoEgg.closest("article");
    expect(tomatoCard).not.toBeNull();
    expect(within(tomatoCard as HTMLElement).getByText("荤菜")).toBeVisible();
    expect(
      within(tomatoCard as HTMLElement).getByText("制作者：小林"),
    ).toBeVisible();
    expect(
      within(tomatoCard as HTMLElement).getByText("食材：番茄、鸡蛋"),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "青菜" })).toBeVisible();
  });

  it("filters by cook and category", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      let body = dishes;
      if (url.includes("category=")) body = [dishes[0]];
      if (url.includes("cook_id=")) body = [dishes[1]];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DishListPage members={members} />);
    await screen.findByText("番茄炒蛋");

    fireEvent.change(screen.getByLabelText("类别"), {
      target: { value: "荤菜" },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/dishes?category=%E8%8D%A4%E8%8F%9C",
        expect.objectContaining({ credentials: "include" }),
      ),
    );

    fireEvent.change(screen.getByLabelText("类别"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("制作者"), {
      target: { value: "m2" },
    });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/dishes?cook_id=m2",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
  });

  it("archives a dish only after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(dishes), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...dishes[0], archived_at: "2026-08-08T01:00:00Z" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([dishes[1]]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<DishListPage members={members} />);
    const card = (await screen.findByText("番茄炒蛋")).closest("article");
    expect(card).not.toBeNull();
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "归档" }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/dishes/d1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText("番茄炒蛋")).not.toBeInTheDocument(),
    );
  });
});

describe("DishForm", () => {
  it("submits camelCase DishInput and maps to API body", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <DishForm
        members={members}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("菜名"), {
      target: { value: "番茄炒蛋" },
    });
    fireEvent.change(screen.getByLabelText("类别"), {
      target: { value: "荤菜" },
    });
    fireEvent.click(screen.getByLabelText("小林"));
    fireEvent.change(screen.getByLabelText("食材"), {
      target: { value: "番茄, 鸡蛋" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "菜品表单" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const payload = onSubmit.mock.calls[0][0] as DishInput;
    expect(payload).toEqual({
      name: "番茄炒蛋",
      category: "荤菜",
      cookIds: ["m1"],
      ingredients: ["番茄", "鸡蛋"],
      imageKey: null,
    });
  });
});
