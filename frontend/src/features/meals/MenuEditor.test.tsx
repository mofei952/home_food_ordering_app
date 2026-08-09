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
});
