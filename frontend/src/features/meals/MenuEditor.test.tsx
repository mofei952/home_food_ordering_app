import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "../../ui/Toast";
import { MenuEditor } from "./MenuEditor";

describe("MenuEditor", () => {
  it("disables confirm when no dishes are selected", () => {
    const onConfirm = vi.fn(async () => {});
    render(
      <ToastProvider>
        <MenuEditor
          menu={[]}
          requests={[]}
          version={0}
          confirmed={false}
          dishOptions={[{ id: "d1", name: "番茄炒蛋" }]}
          onConfirm={onConfirm}
        />
      </ToastProvider>,
    );

    const confirm = screen.getByRole("button", { name: /确认菜单/ });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "从菜品库添加" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "番茄炒蛋" }));
    expect(confirm).not.toBeDisabled();
  });

  it("prefills from meal requests when menu is empty", () => {
    const onConfirm = vi.fn(async () => {});
    render(
      <ToastProvider>
        <MenuEditor
          menu={[]}
          requests={[
            {
              dish_id: "d1",
              dish_name: "番茄炒蛋",
              image_key: null,
              requested_by: [{ id: "m1", nickname: "小林" }],
            },
          ]}
          version={0}
          confirmed={false}
          dishOptions={[{ id: "d1", name: "番茄炒蛋" }]}
          onConfirm={onConfirm}
        />
      </ToastProvider>,
    );

    expect(screen.getByRole("button", { name: /确认菜单/ })).not.toBeDisabled();
    expect(screen.getByText("番茄炒蛋")).toBeVisible();
  });

  it("prefers existing menu over meal requests", () => {
    render(
      <ToastProvider>
        <MenuEditor
          menu={[
            {
              dish_id: "d2",
              dish_name: "青椒肉丝",
              image_key: null,
            },
          ]}
          requests={[
            {
              dish_id: "d1",
              dish_name: "番茄炒蛋",
              image_key: null,
              requested_by: [{ id: "m1", nickname: "小林" }],
            },
          ]}
          version={1}
          confirmed={false}
          dishOptions={[
            { id: "d1", name: "番茄炒蛋" },
            { id: "d2", name: "青椒肉丝" },
          ]}
          onConfirm={vi.fn(async () => {})}
        />
      </ToastProvider>,
    );

    expect(screen.getByText("青椒肉丝")).toBeVisible();
    expect(screen.queryByText("番茄炒蛋")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /确认菜单（1 道）/ })).toBeVisible();
  });

  it("restores requests via 采用想吃清单 after clearing selection", () => {
    render(
      <ToastProvider>
        <MenuEditor
          menu={[]}
          requests={[
            {
              dish_id: "d1",
              dish_name: "番茄炒蛋",
              image_key: null,
              requested_by: [{ id: "m1", nickname: "小林" }],
            },
            {
              dish_id: "d2",
              dish_name: "青椒肉丝",
              image_key: null,
              requested_by: [{ id: "m1", nickname: "小林" }],
            },
          ]}
          version={0}
          confirmed={false}
          dishOptions={[
            { id: "d1", name: "番茄炒蛋" },
            { id: "d2", name: "青椒肉丝" },
          ]}
          onConfirm={vi.fn(async () => {})}
        />
      </ToastProvider>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "移除" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "移除" })[0]);

    expect(
      screen.getByText(/想吃清单里有菜，点「采用想吃清单」/),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "采用想吃清单（2 道）" }),
    );
    expect(screen.getByText("番茄炒蛋")).toBeVisible();
    expect(screen.getByText("青椒肉丝")).toBeVisible();
    expect(screen.getByRole("button", { name: /确认菜单（2 道）/ })).not.toBeDisabled();
  });

  it("shows 未知菜品 and disables move-up on the first item", () => {
    render(
      <ToastProvider>
        <MenuEditor
          menu={[
            {
              dish_id: "gone",
              dish_name: "已删菜",
              image_key: null,
            },
          ]}
          requests={[]}
          version={0}
          confirmed={true}
          dishOptions={[]}
          onConfirm={vi.fn(async () => {})}
        />
      </ToastProvider>,
    );

    expect(screen.getByText("未知菜品")).toBeVisible();
    expect(screen.getByRole("button", { name: "上移" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /更新菜单（1 道）/ })).toBeVisible();
  });
});
