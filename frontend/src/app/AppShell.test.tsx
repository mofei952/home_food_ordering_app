import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it } from "vitest";

import { MenuEditor } from "../features/meals/MenuEditor";
import { AppShell } from "./AppShell";

function mockNavigatorOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
}

function renderShell(ui: ReactNode = <AppShell />) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

afterEach(() => {
  mockNavigatorOnline(true);
});

it("shows four primary destinations", () => {
  renderShell();
  for (const name of ["今天", "菜品", "帮我选", "家庭"]) {
    expect(screen.getByRole("link", { name })).toBeVisible();
  }
});

it("explains that writes require a network connection", () => {
  mockNavigatorOnline(false);
  renderShell();
  expect(
    screen.getByText("当前离线，可查看已缓存页面，恢复网络后再提交"),
  ).toBeVisible();
});

it("disables write buttons while offline and keeps form values", () => {
  mockNavigatorOnline(false);
  renderShell(
    <AppShell>
      <form aria-label="示例表单">
        <input aria-label="菜名" defaultValue="番茄炒蛋" />
        <button type="submit">保存</button>
      </form>
    </AppShell>,
  );

  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  expect(screen.getByLabelText("菜名")).toHaveValue("番茄炒蛋");
});

it("disables real feature write controls marked data-write while offline", () => {
  mockNavigatorOnline(false);
  renderShell(
    <AppShell>
      <MenuEditor
        menu={[]}
        version={0}
        dishOptions={[{ id: "d1", name: "番茄炒蛋" }]}
        onConfirm={async () => {}}
      />
      <button type="button" aria-pressed="false">
        晚餐
      </button>
    </AppShell>,
  );

  expect(screen.getByRole("button", { name: "确认菜单" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "晚餐" })).not.toBeDisabled();
  expect(screen.getByRole("link", { name: "今天" })).toBeVisible();
});
