import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { ToastProvider } from "../ui/Toast";
import { App } from "./App";

function renderApp() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it("renders the product name", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
  );
  renderApp();
  expect(
    await screen.findByRole("heading", { name: "家庭点菜" }),
  ).toBeVisible();
});

it("shows a Chinese service error and retry for session network failures", async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetchMock);

  renderApp();

  expect(
    await screen.findByRole("alert", {
      name: "服务暂时不可用，请稍后重试",
    }),
  ).toBeVisible();
  expect(
    screen.queryByRole("form", { name: "创建家庭" }),
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
});
