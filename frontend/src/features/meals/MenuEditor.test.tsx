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
});
