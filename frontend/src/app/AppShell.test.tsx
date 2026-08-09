import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { ToastProvider } from "../ui/Toast";
import { MealRequests } from "../features/meals/MealRequests";
import { MenuEditor } from "../features/meals/MenuEditor";
import { AppShell } from "./AppShell";

function mockNavigatorOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
}

function renderShell(ui: ReactNode = <AppShell />) {
  return render(
    <MemoryRouter>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>,
  );
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
        requests={[]}
        version={0}
        confirmed={false}
        dishOptions={[{ id: "d1", name: "番茄炒蛋" }]}
        onConfirm={async () => {}}
      />
      <button type="button" aria-pressed="false">
        晚餐
      </button>
    </AppShell>,
  );

  expect(screen.getByRole("button", { name: /确认菜单/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: "晚餐" })).not.toBeDisabled();
  expect(screen.getByRole("link", { name: "今天" })).toBeVisible();
});

it("disables MealRequests pick button while offline", () => {
  mockNavigatorOnline(false);
  const onRequest = vi.fn();
  renderShell(
    <AppShell>
      <MealRequests
        requests={[]}
        currentMemberId="m1"
        dishes={[
          {
            id: "d1",
            name: "番茄炒蛋",
            category: "荤菜",
            cooks: [{ id: "m1", nickname: "小林" }],
            ingredients: [],
            image_key: null,
            image_url: null,
            archived_at: null,
            updated_by: { id: "m1", nickname: "小林" },
            updated_at: "2026-08-08T00:00:00Z",
          },
        ]}
        onRequest={onRequest}
        onWithdraw={() => {}}
      />
    </AppShell>,
  );

  expect(screen.getByRole("button", { name: "+ 想吃的菜" })).toBeDisabled();
  expect(onRequest).not.toHaveBeenCalled();
});
