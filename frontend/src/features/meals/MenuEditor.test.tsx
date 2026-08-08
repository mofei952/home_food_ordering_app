import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MenuEditor } from "./MenuEditor";

describe("MenuEditor", () => {
  it("disables confirm when no dishes are selected", () => {
    const onConfirm = vi.fn(async () => {});
    render(
      <MenuEditor
        menu={[]}
        version={0}
        dishOptions={[{ id: "d1", name: "番茄炒蛋" }]}
        onConfirm={onConfirm}
      />,
    );

    const confirm = screen.getByRole("button", { name: "确认菜单" });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "加入最终菜单：番茄炒蛋" }));
    expect(confirm).not.toBeDisabled();
  });
});
